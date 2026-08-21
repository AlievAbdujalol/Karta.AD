import 'leaflet/dist/leaflet.css';
import { getNextStopEta } from '@/utils/eta';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, Circle, ScaleControl, useMap, useMapEvents } from 'react-leaflet';
import MapControls, { TILE_LAYERS, LABEL_OVERLAY_URL } from './MapControls';
import RoutingPanel from './RoutingPanel';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useNavigation } from '@/lib/NavigationContext';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';
import { Heart, X, Crosshair, MapPin, Loader2, Check } from 'lucide-react';
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

function MapController({ center, mapRef }) {
  const map = useMap();
  const lat = center?.[0];
  const lng = center?.[1];
  useEffect(() => {
    mapRef.current = map;
    if (lat && lng) map.setView([lat, lng], 13);
  }, [lat, lng, map, mapRef]);
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

function NavigationUserArrow({ position, heading }) {
  const icon = L.divIcon({
    html: `<div style="position:relative;width:46px;height:46px;">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${heading || 0}deg);transition:transform 0.15s linear;">
        <div style="position:relative;width:36px;height:36px;">
          <svg width="36" height="36" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 6px rgba(37,99,235,0.6));">
            <path d="M12 2 L20 20 L12 15.5 L4 20 Z" fill="#2563EB" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
          <div style="position:absolute;top:11px;left:50%;transform:translateX(-50%);width:10px;height:10px;border-radius:50%;background:#fff;"></div>
        </div>
      </div>
      <div style="position:absolute;inset:-6px;border-radius:50%;background:radial-gradient(circle, rgba(37,99,235,0.25) 0%, rgba(37,99,235,0) 70%);"></div>
    </div>`,
    className: '',
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  });

  return <Marker position={position} icon={icon} zIndexOffset={1000} interactive={false} />;
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
  const { user, refreshUser } = useCurrentUser();
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
          }).then(({ error }) => {
            if (error) console.error('[TripLog] insert failed:', error);
          }).catch(() => {});
          refreshUser();
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

function NavigationCamera({ followUser, userPosition, reroute, routeData }) {
  const map = useMap();
  const lastRerouteRef = useRef(0);
  const lastPosRef = useRef(null);

  useEffect(() => {
    if (!followUser || !userPosition) return;
    map.setView(userPosition, Math.max(map.getZoom(), 17), { animate: true, duration: 0.5 });
  }, [userPosition, followUser, map]);

  // Auto-reroute when deviated >30m
  useEffect(() => {
    if (!userPosition || !routeData?.from || !routeData?.to) return;
    const now = Date.now();
    if (now - lastRerouteRef.current < 30000) return;

    const last = lastPosRef.current;
    lastPosRef.current = userPosition;

    if (!last || !routeData?.geometry?.length) return;

    let minDist = Infinity;
    for (const pt of routeData.geometry) {
      const d = Math.hypot(userPosition[0] - pt[0], userPosition[1] - pt[1]) * 111320;
      if (d < minDist) minDist = d;
    }

    if (minDist > 30) {
      lastRerouteRef.current = now;
      reroute?.(routeData.from, routeData.to, routeData.mode === 'walking' ? 'walking' : 'driving');
    }
  }, [userPosition, routeData, reroute]);

  return null;
}

export default function BusMap({ vehicles = [], route = null, center = [38.559, 68.773], watchedStop = null, flyTo = null, onFlyDone = null, routes = [], onRoutingOpen, onRoutingStateChange, contactLocations = [], groupRouteMembers = [], onShareTrip, groupRoute, panelVisible, onLocate }) {
  const [tileIndex, setTileIndex] = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [routingRoute, setRoutingRoute] = useState(null);
  const [mapPickTarget, setMapPickTarget] = useState(null);
  const [mapPickResult, setMapPickResult] = useState(null);
  const [routeGeometries, setRouteGeometries] = useState({});
  const getEtaLabel = (vehicle) => getNextStopEta(vehicle, route) || null;
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const mapRef = useRef(null);
  const nav = useNavigation();

  const handleMapPick = useCallback(async (data) => {
    let name = `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`;
    let display_name = name;
    let city = '';
    let country = '';
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}&accept-language=ru`,
        { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(3000) }
      );
      if (resp.ok) {
        const respData = await resp.json();
        display_name = respData.display_name || name;
        if (respData.display_name) {
          const parts = respData.display_name.split(',');
          name = parts.slice(0, 2).join(',');
        }
        if (respData.address) {
          city = respData.address.city || respData.address.town || respData.address.village || respData.address.municipality || '';
          country = respData.address.country || '';
        }
      }
    } catch {}
    const result = { lat: data.lat, lng: data.lng, name, shortName: name, display_name, city, country, target: data.target };
    setMapPickResult(result);
    setMapPickTarget(null);
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) { toast.error('Не удалось определить местоположение.'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (mapRef.current) mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 0.8 });
        let name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        let display_name = name;
        let city = '', country = '';
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`,
            { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(3000) }
          );
          if (resp.ok) {
            const data = await resp.json();
            display_name = data.display_name || name;
            if (data.display_name) {
              const parts = data.display_name.split(',');
              name = parts.slice(0, 2).join(',');
            }
            city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || '';
            country = data.address?.country || '';
          }
        } catch {}
        setMapPickResult({ lat, lng, name, shortName: name, display_name, city, country, target: 'from' });
        setMapPickTarget(null);
      },
      () => toast.error('Не удалось определить местоположение.'),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, []);

  const handleLocateAndPick = useCallback((target) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (mapRef.current) mapRef.current.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { animate: true, duration: 0.5 });
        setMapPickTarget(target);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  const handleFinderToggle = useCallback(() => {
    setRoutingOpen(prev => {
      const opening = !prev;
      if (opening && onRoutingOpen) onRoutingOpen();
      return opening;
    });
    if (routingOpen) { setRoutingRoute(null); setMapPickTarget(null); }
  }, [routingOpen, onRoutingOpen]);

  useEffect(() => {
    if (onRoutingStateChange) onRoutingStateChange(routingOpen);
  }, [routingOpen, onRoutingStateChange]);

  function MapPickerOverlay({ target, onPick, onCancel }) {
    const map = useMap();
    const [centerLatLng, setCenterLatLng] = useState(map.getCenter());
    const [address, setAddress] = useState(null);
    const [loading, setLoading] = useState(false);
    const geocodeTimerRef = useRef(null);

    useMapEvents({
      moveend() {
        setCenterLatLng(map.getCenter());
      },
    });

    useEffect(() => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
      setLoading(true);
      geocodeTimerRef.current = setTimeout(async () => {
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${centerLatLng.lat}&lon=${centerLatLng.lng}&accept-language=ru`,
            { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(3000) }
          );
          if (resp.ok) {
            const data = await resp.json();
            let name = data.display_name ? data.display_name.split(',').slice(0, 2).join(',') : `${centerLatLng.lat.toFixed(5)}, ${centerLatLng.lng.toFixed(5)}`;
            let city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || '';
            let country = data.address?.country || '';
            setAddress({
              name,
              display_name: data.display_name || name,
              city,
              country,
              lat: centerLatLng.lat,
              lng: centerLatLng.lng,
            });
          }
        } catch {}
        setLoading(false);
      }, 400);
      return () => { if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current); };
    }, [centerLatLng.lat, centerLatLng.lng]);

    const handleMyLocation = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => onPick({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { setAddress(prev => prev ? { ...prev } : null); setLoading(false); },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    };

    const handleConfirm = () => {
      onPick(centerLatLng);
    };

    return (
      <div className="absolute inset-0 z-[999]">
        <div className="absolute inset-0 bg-black/5 pointer-events-none" />

        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-14 h-14">
            <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-xl" style={{ filter: 'drop-shadow(0 2px 8px rgba(37,99,235,0.4))' }}>
              <circle cx="24" cy="24" r="16" fill="none" stroke="#2563EB" strokeWidth="2.5" opacity="0.3" />
              <circle cx="24" cy="24" r="10" fill="none" stroke="#2563EB" strokeWidth="2.5" />
              <circle cx="24" cy="24" r="3" fill="#2563EB" />
              <line x1="24" y1="0" x2="24" y2="10" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
              <line x1="24" y1="38" x2="24" y2="48" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
              <line x1="0" y1="24" x2="10" y2="24" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
              <line x1="38" y1="24" x2="48" y2="24" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Address info */}
        <div className="absolute bottom-32 left-4 right-4 pointer-events-auto">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/60 p-4">
            {loading ? (
              <div className="flex items-center gap-2.5">
                <Loader2 size={15} className="animate-spin text-blue-500" />
                <span className="text-xs font-medium text-slate-400">Определение адреса...</span>
              </div>
            ) : address ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={14} className="text-blue-600 flex-shrink-0" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{address.name || 'Без названия'}</p>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 ml-6 truncate">{address.display_name}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 ml-6 mt-1 font-mono">
                  {centerLatLng.lat.toFixed(6)}, {centerLatLng.lng.toFixed(6)}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <MapPin size={15} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-400">Переместите карту для выбора</span>
              </div>
            )}
          </div>
        </div>

        {/* Моё местоположение */}
        <div className="absolute bottom-8 left-4 pointer-events-auto">
          <button
            onClick={handleMyLocation}
            className="w-12 h-12 rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl border border-slate-200/60 flex items-center justify-center hover:bg-white transition-all active:scale-95"
          >
            <Crosshair size={18} className="text-blue-600" />
          </button>
        </div>

        {/* Green confirm button */}
        <div className="absolute bottom-8 right-4 pointer-events-auto">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/30 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={26} strokeWidth={3} />
          </button>
        </div>

        {/* Cancel */}
        <div className="absolute top-4 right-20 pointer-events-auto">
          <button
            onClick={onCancel}
            className="w-10 h-10 rounded-full bg-white/95 dark:bg-slate-900/95 shadow-lg border border-slate-200/60 flex items-center justify-center hover:bg-white transition-all"
          >
            <X size={16} className="text-slate-600" />
          </button>
        </div>
      </div>
    );
  }

  const routingIcon = L.divIcon({
    html: `<div style="position:relative;width:24px;height:24px;">
      <div style="width:24px;height:24px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,0.5);"></div>
    </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  const routingFromIcon = L.divIcon({
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 2px 8px rgba(34,197,94,0.5);"></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  const routingToIcon = L.divIcon({
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 8px rgba(239,68,68,0.5);"></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  const isHybrid = TILE_LAYERS[tileIndex].isHybrid;
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
        tms={TILE_LAYERS[tileIndex].tms || false}
      />
      <MapController center={center} mapRef={mapRef} />
      <FlyToHandler flyTo={flyTo} onDone={onFlyDone} />
      <ScaleControl position="bottomleft" imperial={false} metric={true} />
      {!mapPickTarget && <MapControls tileIndex={tileIndex} setTileIndex={setTileIndex} finderActive={routingOpen} onFinderToggle={handleFinderToggle} onShareTrip={onShareTrip} rightOffset={routingOpen ? 400 : panelVisible ? 360 : 0} isNavigating={nav.isActive} onLocate={onLocate} />}

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



      {/* Built route polyline + markers */}
      {routingRoute && routingRoute.geometry && (
        <>
          <Polyline
            positions={routingRoute.geometry}
            color={routingRoute.mode === 'walking' ? '#7C3AED' : routingRoute.mode === 'cycling' ? '#059669' : '#2563EB'}
            weight={6}
            opacity={0.8}
          />
          {routingRoute.from && (
            <Marker position={[routingRoute.from.lat, routingRoute.from.lng]} icon={routingFromIcon}>
              <Popup><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>📍 {routingRoute.from.shortName || 'Откуда'}</div></Popup>
            </Marker>
          )}
          {routingRoute.to && (
            <Marker position={[routingRoute.to.lat, routingRoute.to.lng]} icon={routingToIcon}>
              <Popup><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>🏁 {routingRoute.to.shortName || 'Куда'}</div></Popup>
            </Marker>
          )}
          {routingRoute.waypoints && routingRoute.waypoints.filter(Boolean).map((wp, i) => (
            <Marker key={`wp-${i}`} position={[wp.lat, wp.lng]} icon={routingIcon}>
              <Popup><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>➕ {wp.shortName || `Точка ${i + 1}`}</div></Popup>
            </Marker>
          ))}
        </>
      )}

      {mapPickTarget && (
        <MapPickerOverlay
          target={mapPickTarget}
          onPick={(latlng) => handleMapPick({ lat: latlng.lat, lng: latlng.lng, target: mapPickTarget })}
          onCancel={() => { setMapPickTarget(null); setMapPickResult(null); }}
        />
      )}

      {nav.isActive && nav.userPosition ? (
        <NavigationUserArrow position={nav.userPosition} heading={nav.userHeading} />
      ) : (
        <UserLocationMarker />
      )}

      {/* Navigation camera follow + arrow */}
      {nav.isActive && <NavigationCamera followUser={nav.followUser} userPosition={nav.userPosition} reroute={nav.reroute} routeData={nav.routeData} />}

      {/* Group route members */}
      {groupRouteMembers.filter(m => m.lat && m.lng).map((member) => {
        const isCreator = member.role === 'creator';
        const color = isCreator ? '#3b82f6' : '#ef4444';
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:40px;height:40px;">
            <div style="width:40px;height:40px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
              <span style="color:white;font-size:13px;font-weight:700;">${(member.full_name || member.user_id || '?')[0]}</span>
            </div>
            <div style="position:absolute;bottom:-3px;right:-3px;width:14px;height:14px;background:#22c55e;border-radius:50%;border:2px solid white;"></div>
          </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        return (
          <Marker key={`group-member-${member.user_id}`} position={[member.lat, member.lng]} icon={icon}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>
                <div>{member.full_name || 'Участник'}</div>
                <div style={{ fontSize: 10, color: isCreator ? '#3b82f6' : '#ef4444', marginTop: 2 }}>
                  {isCreator ? 'Создатель' : 'Участник'}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Contact locations */}
      {contactLocations.filter(c => c.lat && c.lng).map((contact) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:36px;">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
              <span style="color:white;font-size:12px;font-weight:700;">${(contact.full_name || '?')[0]}</span>
            </div>
            <div style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;background:#22c55e;border-radius:50%;border:2px solid white;"></div>
          </div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        return (
          <Marker key={`contact-${contact.user_id}`} position={[contact.lat, contact.lng]} icon={icon}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>
                <div>{contact.full_name}</div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                  {contact.updated_at ? new Date(contact.updated_at).toLocaleTimeString('ru') : ''}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>

      {/* Routing panel — outside MapContainer to avoid Leaflet stacking context */}
      {routingOpen && (
        <RoutingPanel
          onClose={() => { setRoutingOpen(false); setRoutingRoute(null); setMapPickTarget(null); setMapPickResult(null); if (onRoutingStateChange) onRoutingStateChange(false); }}
          onRouteBuilt={(route) => setRoutingRoute(route)}
          onStartNavigation={(route) => {
            nav.startNavigationWithFromTo(route, route.from, route.to);
            setRoutingOpen(false);
            setRoutingRoute(null);
            setMapPickTarget(null);
            setMapPickResult(null);
            if (onRoutingStateChange) onRoutingStateChange(false);
          }}
          mapCenter={center}
          user={user}
          onRequestMapPick={setMapPickTarget}
          onLocateAndPick={handleLocateAndPick}
          onLocateMe={handleLocateMe}
          mapPickTarget={mapPickTarget}
          mapPickResult={mapPickResult}
        />
      )}

    </div>
  );
}