import 'leaflet/dist/leaflet.css';
import { getNextStopEta } from '@/utils/eta';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, Circle, ScaleControl, useMap, useMapEvents } from 'react-leaflet';
import MapControls, { TILE_LAYERS, LABEL_OVERLAY_URL } from './MapControls';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';
import { Heart, Navigation } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { TripLog } from '@/api/entities';

// Haversine distance in meters
function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Inject CSS to hide leaflet attribution and style controls
const style = document.createElement('style');
style.textContent = `
  .leaflet-control-attribution { display: none !important; }
  .leaflet-control-zoom { display: none !important; }
  .leaflet-control-scale-line {
    background: rgba(255,255,255,0.9) !important;
    border: none !important;
    border-radius: 6px !important;
    padding: 2px 8px !important;
    font-size: 10px !important;
    font-weight: 600 !important;
    color: #475569 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
    backdrop-filter: blur(8px) !important;
    font-family: Inter, sans-serif !important;
  }
  .leaflet-tooltip {
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
  }
  .leaflet-tooltip::before {
    border-top-color: transparent !important;
  }
`;
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

function FlyToHandler({ flyTo, onDone }) {
  const map = useMap();
  useEffect(() => {
    if (!flyTo) return;
    map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom || 15, { duration: 1 });
    if (onDone) {
      const timer = setTimeout(() => onDone(), 1200);
      return () => clearTimeout(timer);
    }
  }, [flyTo?.lat, flyTo?.lng]);
  return null;
}

function UserLocationMarker() {
  const [pos, setPos] = useState(null);
  const [accuracy, setAccuracy] = useState(0);
  const map = useMap();

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude]);
        setAccuracy(p.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  if (!pos) return null;

  const userIcon = L.divIcon({
    html: `<div style="position:relative;width:20px;height:20px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.15);border:2px solid #3b82f6;box-shadow:0 0 12px rgba(59,130,246,0.4);"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
    </div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  return (
    <>
      <Circle
        center={pos}
        radius={accuracy}
        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 1 }}
      />
      <Marker position={pos} icon={userIcon} zIndexOffset={1000}>
        <Popup>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: '#3b82f6' }}>📍 Вы здесь</div>
            <div style={{ color: '#888', marginTop: 2 }}>Точность: {Math.round(accuracy)} м</div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

function RouteNumberLabel({ positions, routeNumber, routeName, color }) {
  const labels = useMemo(() => {
    if (!positions || positions.length < 3) return [];
    const mid = Math.floor(positions.length / 2);
    return [{ lat: positions[mid][0], lng: positions[mid][1] }];
  }, [positions]);

  if (labels.length === 0) return null;

  return labels.map((label, i) => (
    <Marker
      key={`rlabel-${i}`}
      position={[label.lat, label.lng]}
      icon={L.divIcon({
        html: `<div style="
          background:${color || '#1565C0'};
          color:#fff;
          border-radius:8px;
          padding:3px 8px;
          font-size:10px;
          font-weight:800;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
          border:2px solid rgba(255,255,255,0.9);
          font-family:Inter,sans-serif;
          letter-spacing:-0.3px;
        ">#${routeNumber}${routeName ? ` ${routeName}` : ''}</div>`,
        className: '',
        iconSize: [0, 0],
        iconAnchor: [0, -12],
      })}
      interactive={false}
      zIndexOffset={60}
    />
  ));
}

function createBusIcon(routeNumber, type, t) {
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
        <span style="color:rgba(255,255,255,0.75);font-size:8px;font-weight:500;">${type === 'minibus' ? t('busmap.minibusAbbr') : t('busmap.busLabel')}</span>
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
  const { t } = useLanguage();
  const [pos, setPos] = useState([vehicle.lat, vehicle.lng]);
  const [paying, setPaying] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const targetRef = useRef([vehicle.lat, vehicle.lng]);
  const currentRef = useRef([vehicle.lat, vehicle.lng]);
  const rafRef = useRef(null);
  const DURATION = 4000;

  useEffect(() => {
    const pos = [vehicle.lat, vehicle.lng];
    setPos(pos);
    currentRef.current = pos;
    targetRef.current = pos;
    snapToRoad(vehicle.lat, vehicle.lng).then(snapped => {
      const snappedPos = [snapped.lat, snapped.lng];
      if (snappedPos[0] === targetRef.current[0] && snappedPos[1] === targetRef.current[1]) return;
      const startPerf = performance.now();
      const startPos = [...currentRef.current];
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const animate = (now) => {
        const elapsed = now - startPerf;
        const t = Math.min(elapsed / DURATION, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        currentRef.current = [
          startPos[0] + (snappedPos[0] - startPos[0]) * ease,
          startPos[1] + (snappedPos[1] - startPos[1]) * ease,
        ];
        setPos([...currentRef.current]);
        if (t < 1) rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
    });
  }, [vehicle.lat, vehicle.lng]);

  const handlePay = async () => {
    if (!user) {
      toast.error(t('busmap.paymentLoginRequired'));
      return;
    }
    if (!user.phone) {
      toast.error(t('busmap.paymentPhoneRequired'));
      return;
    }

    const fare = vehicle.type === 'minibus' ? 3.00 : 2.50;
    const userBalance = Number(user.balance || 0);

    if (userBalance < fare) {
      toast.error(`${t('busmap.paymentInsufficientBalance')} ${fare} TJS. ${t('profile.balanceLabel')} ${userBalance.toFixed(2)} TJS.`);
      return;
    }

    if (window.confirm(`${t('busmap.paymentConfirmTitle')} #${vehicle.route_number} ${t('schedulePanel.somoni')} ${fare} TJS?`)) {
      setPaying(true);
      try {
        const { data, error } = await supabase.rpc('create_payment', {
          driver_id: vehicle.driver_id,
          amount: fare
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        if (data?.success) {
          toast.success(t('busmap.paymentSent'));
          // Логируем поездку
          TripLog.create({
            user_id: user.id,
            route_id: vehicle.route_id || null,
            route_number: vehicle.route_number,
            route_name: vehicle.route_name || '',
            route_type: vehicle.type,
            route_color: vehicle.route_color || '#1565C0',
            city_name: vehicle.city_name || '',
          }).catch(() => {});
          refetch();
        }
      } catch (err) {
        toast.error(err.message || t('busmap.paymentError'));
      } finally {
        setPaying(false);
      }
    }
  };

  useEffect(() => {
    if (!user || !vehicle.driver_id) return;
    supabase.from('favorite_drivers').select('id').eq('user_id', user.id).eq('driver_id', vehicle.driver_id).maybeSingle()
      .then(({ data }) => setIsFav(!!data)).catch(() => {});
  }, [user?.id, vehicle.driver_id]);

  const toggleFavDriver = async () => {
    if (!user || !vehicle.driver_id) return;
    try {
      if (isFav) {
        await supabase.from('favorite_drivers').delete().eq('user_id', user.id).eq('driver_id', vehicle.driver_id);
        setIsFav(false);
        toast.success(t('busmap.favDriverRemoved'));
      } else {
        await supabase.from('favorite_drivers').insert({
          user_id: user.id,
          driver_id: vehicle.driver_id,
          driver_name: vehicle.driver_name || '',
          vehicle_number: vehicle.vehicle_number || '',
          route_number: vehicle.route_number || '',
          route_name: route?.name || '',
        });
        setIsFav(true);
        toast.success(t('busmap.favDriverAdded'));
      }
    } catch { toast.error(t('error')); }
  };

  const icon = createBusIcon(vehicle.route_number || '?', vehicle.type, t);
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
            <span style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>{vehicle.type === 'minibus' ? t('busmap.minibusLabel') : t('busmap.busLabel')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              {vehicle.driver_name && <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>👤 {vehicle.driver_name}</div>}
              {vehicle.vehicle_number && <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>🚌 № {vehicle.vehicle_number}</div>}
            </div>
            {user && vehicle.driver_id && (
              <button onClick={toggleFavDriver} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Heart size={18} fill={isFav ? '#ef4444' : 'none'} stroke={isFav ? '#ef4444' : '#999'} />
              </button>
            )}
          </div>
          {vehicle.speed > 0 && <div style={{ fontSize: 12, color: '#999' }}>⚡ {Math.round(vehicle.speed)} {t('speedUnit')}</div>}
          {eta && (
            <div style={{ marginTop: 8, background: '#e3f2fd', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: '#1565c0', fontWeight: 600 }}>
              ⏱ {eta.stop?.name ? `${eta.stop.name}: ` : ''}{eta.etaMinutes} {t('minutes')}
            </div>
          )}

          {user && vehicle.driver_id && (
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
              {paying ? t('busmap.sending') : `${t('busmap.payButton')} ${vehicle.type === 'minibus' ? '3.00' : '2.50'} TJS`}
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

async function snapToRoad(lat, lng) {
  try {
    const resp = await fetch(
      `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!resp.ok) return { lat, lng };
    const data = await resp.json();
    if (data.waypoints?.[0]?.location) {
      const [snappedLng, snappedLat] = data.waypoints[0].location;
      return { lat: snappedLat, lng: snappedLng };
    }
  } catch {}
  return { lat, lng };
}

// Map click handler for route finder mode
function ClickHandler({ finderActive, onFinderClick }) {
  useMapEvents({
    click(e) {
      if (finderActive) onFinderClick(e.latlng);
    },
  });
  return null;
}

export default function BusMap({ vehicles = [], route = null, center = [38.559, 68.773], watchedStop = null, flyTo = null, onFlyDone = null, routes = [] }) {
  const [tileIndex, setTileIndex] = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [finderActive, setFinderActive] = useState(false);
  const [finderResult, setFinderResult] = useState(null);
  const [routeGeometries, setRouteGeometries] = useState({});
  const getEtaLabel = (vehicle) => getNextStopEta(vehicle, route) || null;
  const { t } = useLanguage();

  // Route finder mode: find nearest route with wait time
  const handleFinderToggle = useCallback(() => {
    setFinderActive(prev => !prev);
    if (finderActive) {
      setFinderResult(null);
    }
  }, [finderActive]);

  const handleFinderClick = useCallback((latlng) => {
    setFinderActive(false);

    const results = [];
    (routes || []).forEach(r => {
      if (!r.stops || !Array.isArray(r.stops) || r.stops.length === 0) return;
      let nearestStop = null;
      let minDist = Infinity;
      r.stops.forEach(s => {
        if (!s.lat || !s.lng) return;
        const d = distM(latlng.lat, latlng.lng, s.lat, s.lng);
        if (d < minDist) { minDist = d; nearestStop = s; }
      });
      if (!nearestStop) return;
      const routeVehicles = (vehicles || []).filter(v =>
        (v.route_id === r.id || v.route_number === r.number) && v.lat && v.lng
      );
      let nearestVehicle = null;
      let vehicleDist = Infinity;
      routeVehicles.forEach(v => {
        const d = distM(nearestStop.lat, nearestStop.lng, v.lat, v.lng);
        if (d < vehicleDist) { vehicleDist = d; nearestVehicle = v; }
      });
      let etaMinutes = null;
      if (nearestVehicle) {
        const distKm = vehicleDist / 1000;
        const speedKmh = nearestVehicle.speed > 2 ? nearestVehicle.speed : 20;
        etaMinutes = Math.max(1, Math.round((distKm / speedKmh) * 60));
      }
      results.push({
        route: r,
        stop: nearestStop,
        stopDist: Math.round(minDist),
        vehicle: nearestVehicle,
        vehicleDist: Math.round(vehicleDist),
        etaMinutes,
      });
    });

    results.sort((a, b) => a.stopDist - b.stopDist);
    const top = results.slice(0, 3);
    setFinderResult({ point: latlng, results: top, best: top[0] || null });
  }, [routes, vehicles]);

  const finderIcon = L.divIcon({
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:14px solid #7c3aed;"></div>
      <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:18px;height:18px;border-radius:50%;background:#7c3aed;border:3px solid #fff;box-shadow:0 2px 8px rgba(124,58,237,0.5);display:flex;align-items:center;justify-content:center;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      </div>
    </div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });

  const isHybrid = tileIndex === 1;
  useEffect(() => {
    if (isHybrid) setShowLabels(true);
  }, [isHybrid]);

  // Fetch OSRM geometry for all routes (sequential, with fallback to stop positions)
  useEffect(() => {
    const routesWithCoords = (routes || []).filter(r => {
      const pts = r.stops?.filter(s => s.lat && s.lng);
      return pts && pts.length >= 2;
    });
    if (routesWithCoords.length === 0) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const fetchAll = async () => {
      for (const r of routesWithCoords) {
        if (cancelled) break;
        const pts = r.stops.filter(s => s.lat && s.lng);
        const coords = pts.map(s => `${s.lng},${s.lat}`).join(';');
        try {
          const resp = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
            { signal: ctrl.signal }
          );
          if (!resp.ok) continue;
          const data = await resp.json();
          if (data.routes?.[0]?.geometry?.coordinates) {
            const positions = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            if (!cancelled) {
              setRouteGeometries(prev => ({ ...prev, [r.id]: positions }));
            }
          }
        } catch {}
      }
    };
    fetchAll();
    return () => { cancelled = true; ctrl.abort(); };
  }, [routes]);

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
      <FlyToHandler flyTo={flyTo} onDone={onFlyDone} />
      <ClickHandler finderActive={finderActive} onFinderClick={handleFinderClick} />
      <MapControls tileIndex={tileIndex} setTileIndex={setTileIndex} finderActive={finderActive} onFinderToggle={handleFinderToggle} />
      <ScaleControl position="bottomleft" imperial={false} metric={true} />

      {showLabels && (
        <TileLayer
          url={LABEL_OVERLAY_URL}
          opacity={0.95}
          zIndex={400}
        />
      )}

      {/* All routes as polylines */}
      {(routes || []).map(r => {
        const pts = r.stops?.filter(s => s.lat && s.lng);
        if (!pts || pts.length < 2) return null;
        const isSelected = route && r.id === route.id;
        const geoPositions = routeGeometries[r.id];
        const positions = geoPositions || pts.map(s => [s.lat, s.lng]);
        return (
          <Fragment key={r.id}>
            <Polyline
              positions={positions}
              color={r.color || '#1565C0'}
              weight={isSelected ? 6 : 3}
              opacity={isSelected ? 0.9 : 0.4}
            />
            <RouteNumberLabel
              positions={positions}
              routeNumber={r.number}
              routeName={r.name}
              color={r.color || '#1565C0'}
            />
          </Fragment>
        );
      })}

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
        const dotSize = isWatched ? 24 : (isFirst || isLast) ? 18 : 14;
        const stopName = stop.name || `${t('busmap.stopDefaultName')} ${index + 1}`;

        const icon = L.divIcon({
          html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
            <div style="
              width:${dotSize}px;height:${dotSize}px;
              border-radius:${isWatched ? '6px' : '50%'};
              background:${dotColor};
              border:2.5px solid #fff;
              box-shadow:0 2px 8px rgba(0,0,0,0.25);
              display:flex;align-items:center;justify-content:center;
              ${isWatched ? 'outline: 3px solid rgba(255,109,0,0.35);' : ''}
            ">
              ${isFirst || isLast || isWatched ? '<svg width="' + (dotSize * 0.5) + '" height="' + (dotSize * 0.5) + '" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h20"/><path d="M18 18H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/></svg>' : ''}
            </div>
          </div>`,
          className: '',
          iconSize: [dotSize, dotSize],
          iconAnchor: [dotSize / 2, dotSize / 2],
        });

        return (
          <Marker key={`stop-${index}`} position={[stop.lat, stop.lng]} icon={icon}>
            <Tooltip
              direction="top"
              offset={[0, -dotSize / 2 - 4]}
              opacity={0.95}
              permanent={isWatched || isFirst || isLast}
            >
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                background: dotColor,
                borderRadius: 6,
                padding: '2px 6px',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                border: '1.5px solid rgba(255,255,255,0.8)',
              }}>
                {stopName}
              </div>
            </Tooltip>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{stopName}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{`${t('busmap.stopLabel')} ${index + 1} ${t('busmap.of')} ${total}`}</div>
                <div style={{ marginTop: 6, fontSize: 11, padding: '3px 8px', borderRadius: 6, display: 'inline-block',
                  background: remaining > 0 ? '#e3f2fd' : '#e8f5e9',
                  color: remaining > 0 ? '#1565c0' : '#2e7d32',
                  fontWeight: 600,
                }}>
                  {remaining > 0 ? `${t('busmap.remainingStops')} ${remaining}` : t('busmap.lastStop')}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {vehicles.filter(v => v.lat && v.lng).map(v => (
        <AnimatedVehicleMarker key={v.id} vehicle={v} route={route} getEtaLabel={getEtaLabel} />
      ))}



      {/* Route finder result */}
      {finderResult && (
        <Marker position={[finderResult.point.lat, finderResult.point.lng]} icon={finderIcon}>
          <Popup maxWidth={320} className="finder-popup">
            <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#4c1d95', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Navigation size={14} />
                {t('routeFinder.nearestRoute')}
              </div>
              {finderResult.best ? (
                <>
                  {finderResult.results.map((res, i) => (
                    <div key={res.route.id} style={{
                      background: i === 0 ? '#f5f3ff' : 'transparent',
                      borderRadius: 8, padding: i === 0 ? '8px 10px' : '6px 10px',
                      marginBottom: i === 0 ? 6 : 0,
                      border: i === 0 ? '1.5px solid #ddd6fe' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{
                          display: 'inline-block', padding: '1px 8px', borderRadius: 5,
                          background: res.route.color || '#7c3aed', color: '#fff',
                          fontSize: 11, fontWeight: 800,
                        }}>
                          #{res.route.number}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {res.route.name || t('routeFinder.routeNumber')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 11, color: '#6b7280' }}>
                        <span>🚏 {res.stop.name || t('busmap.stopDefaultName')} <strong>{res.stopDist} {t('routeFinder.meters')}</strong></span>
                        {res.etaMinutes ? (
                          <span>⏱ {t('routeFinder.waitTime')} ~<strong>{res.etaMinutes} {t('routeFinder.minutes')}</strong></span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>{t('routeFinder.noVehicles')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {finderResult.results.length === 0 && (
                    <div style={{ fontSize: 12, color: '#9ca3af', padding: '4px 0' }}>{t('routeFinder.noRoutesFound')}</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: '4px 0' }}>{t('routeFinder.noRoutesFound')}</div>
              )}
              <div style={{ marginTop: 6, fontSize: 10, color: '#d1d5db', textAlign: 'right' }}>
                {finderResult.point.lat.toFixed(4)}, {finderResult.point.lng.toFixed(4)}
              </div>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Route finder hint overlay */}
      {finderActive && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(124,58,237,0.9)', color: '#fff',
          padding: '8px 16px', borderRadius: 12, fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
          backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
        }}>
          <Navigation size={14} />
          {t('routeFinder.hint')}
        </div>
      )}

      <UserLocationMarker />
    </MapContainer>
    </div>
  );
}