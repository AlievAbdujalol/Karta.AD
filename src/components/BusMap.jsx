import 'leaflet/dist/leaflet.css';
import { getNextStopEta } from '@/utils/eta';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, ScaleControl, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'react-leaflet-cluster/lib/assets/MarkerCluster.css';
import 'react-leaflet-cluster/lib/assets/MarkerCluster.Default.css';
import MapControls, { TILE_LAYERS, LABEL_OVERLAY_URL } from './MapControls';
import RoutingPanel from './RoutingPanel';
import StopInfoPopup, { collectUniqueStops } from './StopInfoPopup';
import { useOverpassStops } from '@/hooks/useOverpassStops';
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
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function safeColor(c){ return /^#[0-9a-fA-F]{6}$/.test(c||'') ? c : '#1565C0'; }
function isValidLatLng(lat,lng){ return typeof lat==='number' && typeof lng==='number' && !isNaN(lat) && !isNaN(lng) && lat>=-90 && lat<=90 && lng>=-180 && lng<=180 && Math.abs(lat)>0.001 && Math.abs(lng)>0.001; }
const routeGeomCache = new Map();

// Inject CSS to hide leaflet attribution and style controls
const style = typeof document !== 'undefined' ? document.createElement('style') : null;
if(style) style.textContent = `
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
  .stop-info-popup .leaflet-popup-content-wrapper {
    border-radius: 16px !important;
    padding: 0 !important;
    background: #11162a !important;
    box-shadow: 0 12px 36px rgba(0,0,0,0.5) !important;
    border: 1px solid #1e2a44 !important;
  }
  .stop-info-popup .leaflet-popup-content {
    margin: 0 !important;
    font-family: Inter, sans-serif !important;
    color: #fff !important;
    line-height: 1 !important;
  }
  .stop-info-popup .leaflet-popup-tip {
    background: #11162a !important;
    border: 1px solid #1e2a44 !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
  }
  .stop-info-popup .leaflet-popup-close-button {
    color: #6b7a8d !important;
    font-size: 18px !important;
    padding: 4px 8px !important;
  }
  .stop-info-popup .leaflet-popup-close-button:hover {
    color: #fff !important;
  }
`;
if(style && typeof document !== 'undefined' && !document.getElementById('karta-leaflet-style')){
  style.id='karta-leaflet-style';
  document.head.appendChild(style);
}

if(typeof L !== 'undefined' && L.Icon && L.Icon.Default){
  try{ delete L.Icon.Default.prototype._getIconUrl; }catch{}
  L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

function MapController({ center, mapRef }) {
  const map = useMap();
  const lat = center?.[0];
  const lng = center?.[1];
  useEffect(() => {
    mapRef.current = map;
    if (lat && lng) {
      // двигаем карту только если центр реально ушёл — иначе setView плодит moveend-циклы
      try {
        const c = map.getCenter();
        if (Math.abs(c.lat - lat) < 0.0005 && Math.abs(c.lng - lng) < 0.0005) return;
        map.setView([lat, lng], map.getZoom() || 13);
      } catch { map.setView([lat, lng], 13); }
    }
  }, [lat, lng, map, mapRef]);
  return null;
}
function CenterWatcher({ onCenterChange }){
  const map = useMap();
  const cbRef = useRef(onCenterChange);
  cbRef.current = onCenterChange;
  const lastRef = useRef(null);
  useEffect(()=>{
    const upd=()=>{
      try{
        const c=map.getCenter();
        const prev=lastRef.current;
        // шлём наверх только реально новый центр — новый массив каждый раз = ре-рендер родителя
        if(prev && Math.abs(prev[0]-c.lat)<1e-6 && Math.abs(prev[1]-c.lng)<1e-6) return;
        lastRef.current=[c.lat, c.lng];
        cbRef.current?.([c.lat, c.lng]);
      }catch{}
    };
    // без синхронного upd() на маунте: он дёргал setState родителя в коммите и давал петлю обновлений
    map.on('moveend', upd); return ()=> map.off('moveend', upd);
  },[map]);
  return null;
}
function MapClickHandler({ onMapClick }){
  useMapEvents({ click(e){ try{ navigator.vibrate?.(40); }catch{} onMapClick?.(e.latlng); } });
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

function UserLocationMarker({ transportMode }) {
  const [pos, setPos] = useState(null);
  const [accuracy, setAccuracy] = useState(0);
  const map = useMap();

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        // sensor fusion: if accuracy >50 and use_sensors, keep last pos
        try{ const s=JSON.parse(localStorage.getItem('karta_vehicle')||'{}'); if(s.use_sensors===false && p.coords.accuracy>80) return; }catch{}
        setPos([p.coords.latitude, p.coords.longitude]);
        setAccuracy(p.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  if (!pos) return null;

  const colorByMode = transportMode==='truck'?'#78350f': transportMode==='scooter'?'#0ea5e9': transportMode==='cycling'?'#059669': transportMode==='walking'?'#7c3aed': '#3b82f6';
  const userIcon = L.divIcon({
    html: `<div style="position:relative;width:20px;height:20px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:${colorByMode}22;border:2px solid ${colorByMode};box-shadow:0 0 12px ${colorByMode}66;"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:${colorByMode};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
    </div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  return (
    <>
      <Circle center={pos} radius={Math.min(accuracy || 0, 80)} pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.12, weight: 1.2 }} />
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
          background:${safeColor(color)};
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
        ">#${esc(routeNumber)}${routeName ? ` ${esc(routeName)}` : ''}</div>`,
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
        <span style="color:#fff;font-size:11px;font-weight:800;line-height:1;letter-spacing:-0.5px;">#${esc(routeNumber)}</span>
        <span style="color:rgba(255,255,255,0.75);font-size:8px;font-weight:500;">${esc(type === 'minibus' ? t('busmap.minibusAbbr') : t('busmap.busLabel'))}</span>
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
        const newBalance = Math.max(0, userBalance - fare);
        const { error: balErr } = await supabase.from('profiles').update({ balance: newBalance }).eq('id', user.id);
        if (balErr) throw new Error(balErr.message);
        toast.success(t('busmap.paymentSent'));
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

  // Режим «весь маршрут»: слежение выключено — показываем весь путь от и до
  useEffect(() => {
    if (followUser || !routeData?.geometry?.length) return;
    try {
      const b = L.latLngBounds(routeData.geometry);
      map.fitBounds(b, { paddingTopLeft: [50, 130], paddingBottomRight: [50, 190], animate: true });
    } catch {}
  }, [followUser, routeData, map]);

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

const OsmStopIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#e2e8f0;color:#94a3b8;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.15);border:2px solid #94a3b8;opacity:0.75;">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 18v2"/><path d="M17 18v2"/></svg>
  </div>`,
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function distM2(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function OsmStopMarkers({ routes, routeGeometries, routingOpen, onPickResult }) {
  const osmStops = useOverpassStops();
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const upd = () => setZoom(map.getZoom());
    map.on('zoomend', upd);
    map.on('moveend', upd);
    return () => { map.off('zoomend', upd); map.off('moveend', upd); };
  }, [map]);
  if (zoom < 13) return null;
  // skip OSM stops that are very close to an existing route stop (avoid duplicate icons)
  const routePts = (routes || []).flatMap(r => r.stops || []).filter(s => s.lat && s.lng);
  const filtered = osmStops.filter(os => !routePts.some(rs => distM2(os.lat, os.lng, rs.lat, rs.lng) < 35));
  // viewport + кластеризация — не рендерить сотни вне экрана
  const bounds = map.getBounds();
  const inView = filtered.filter(s => bounds.contains([s.lat, s.lng]));
  const limited = inView.slice(0, 90);
  const limitedKey = limited.map(s => s.id).join('|');
  return (
    <MarkerClusterGroup
      key={`osm-cluster-${limitedKey.length}-${zoom}`}
      chunkedLoading={false}
      maxClusterRadius={42}
      spiderfyOnMaxZoom
      showCoverageOnHover={false}
      zoomToBoundsOnClick
      animate={false}
    >
      {limited.map(s => (
        <Marker key={`osm-${s.id}`} position={[s.lat, s.lng]} icon={OsmStopIcon} bubblingMouseEvents={false}
          eventHandlers={{ click: () => { try { map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 15), { animate: true, duration: 0.5 }); } catch {} try { navigator.vibrate?.(15); } catch {} } }}>
          <Popup maxWidth={300} className="stop-info-popup">
            <StopInfoPopup
              stop={{ lat: s.lat, lng: s.lng, name: s.name }}
              routes={routes}
              routeGeometries={routeGeometries}
              routingOpen={routingOpen}
              onPickFrom={(st) => onPickResult({ lat: st.lat, lng: st.lng, name: st.name, shortName: st.name, display_name: st.name, city: '', country: '', target: 'from' })}
              onPickTo={(st) => onPickResult({ lat: st.lat, lng: st.lng, name: st.name, shortName: st.name, display_name: st.name, city: '', country: '', target: 'to' })}
            />
          </Popup>
        </Marker>
      ))}
    </MarkerClusterGroup>
  );
}

const TILE_KEY = 'karta_tile_index';

export default function BusMap({ vehicles = [], route = null, center = [38.559, 68.773], watchedStop = null, flyTo = null, onFlyDone = null, routes = [], onRoutingOpen, onRoutingStateChange, contactLocations = [], groupRouteMembers = [], onShareTrip, groupRoute, panelVisible, onLocate, tiltEnabled: _tiltEnabled = false, autoCenter = true, routeMeta = null, onPlaceSelect, onCenterChange, onMapClick, eventPos, eventLine=[], roadDir=0, hideEvents=false }) {
  const [tileIndex, setTileIndex] = useState(() => {
    try {
      const v = localStorage.getItem(TILE_KEY);
      if (v != null) {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n >= 0 && n < TILE_LAYERS.length) return n;
      }
    } catch {}
    return 2;
  });
  const [showLabels, setShowLabels] = useState(true);
  const [routingOpen, setRoutingOpen] = useState(false);
  // зеркало для обработчиков: апдейтеры setState обязаны быть чистыми,
  // сайд-эффекты (колбэки родителя) внутри них дают setState в рендере
  const routingOpenRef = useRef(false);
  useEffect(() => { routingOpenRef.current = routingOpen; }, [routingOpen]);
  // маршрут фразой от ИИ: событие karta_ai_route {from, to} → открываем панель и отдаём точки
  const [aiRouteReq, setAiRouteReq] = useState(null);
  useEffect(() => {
    const h = (e) => {
      if (!e?.detail?.from || !e?.detail?.to) return;
      try { navigator.vibrate?.(20); } catch {}
      setAiRouteReq({ ...e.detail, _nonce: Date.now() });
      routingOpenRef.current = true;
      setRoutingOpen(true);
    };
    window.addEventListener('karta_ai_route', h);
    return () => window.removeEventListener('karta_ai_route', h);
  }, []);
  const [routingRoute, setRoutingRoute] = useState(null);
  const [mapPickTarget, setMapPickTarget] = useState(null);
  const [mapPickResult, setMapPickResult] = useState(null);
  const [routeGeometries, setRouteGeometries] = useState({});
  const getEtaLabel = (vehicle) => getNextStopEta(vehicle, route) || null;
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const mapRef = useRef(null);
  const nav = useNavigation();
  // 2D/3D удалён — всегда плоская карта
  useEffect(()=>{ try{ localStorage.removeItem('karta_tilt'); }catch{}
    if(mapRef.current){
      const c=mapRef.current.getContainer();
      if(c){ c.style.transform='none'; c.style.transformOrigin=''; }
      const wrap=c?.parentElement; if(wrap) wrap.style.perspective='';
      setTimeout(()=> mapRef.current?.invalidateSize(), 220);
    }
  },[]);
  // auto-scale based on speed
  useEffect(()=>{
    if(!nav.isActive || !nav.userSpeed || !autoCenter) return;
    const spd = nav.userSpeed*3.6;
    const targetZoom = spd>50?14: spd>30?15: spd>10?16:17;
    if(mapRef.current && Math.abs(mapRef.current.getZoom()-targetZoom)>0.6) mapRef.current.setZoom(targetZoom, {animate:true});
  },[nav.userSpeed, nav.isActive, autoCenter]);
  // PiP: enter when app hidden — показывает манёвр/ETA
  useEffect(()=>{
    const h=()=>{ if(document.visibilityState==='hidden' && nav.isActive && JSON.parse(localStorage.getItem('karta_nav_settings')||'{}')?.pip_enabled && document.pictureInPictureEnabled && !document.pictureInPictureElement){
      try{ const c=mapRef.current?.getContainer(); if(c?.requestPictureInPicture) c.requestPictureInPicture().catch(()=>{}); }catch{}
    }};
    document.addEventListener('visibilitychange', h); return ()=>document.removeEventListener('visibilitychange', h);
  },[nav.isActive]);
  useEffect(()=>{
    const onScale=(e)=>{ if(mapRef.current) mapRef.current.setZoom(e.detail, {animate:true}); };
    window.addEventListener('karta_autoscale', onScale); return ()=>window.removeEventListener('karta_autoscale', onScale);
  },[]);

  const [mapEvents, setMapEvents] = useState([]);
  useEffect(()=>{ const load=()=> supabase.from('map_events').select('*').eq('is_active',true).limit(100).then(({data})=>setMapEvents(data||[])); load(); const ch=supabase.channel('map_events_bus').on('postgres_changes',{event:'*',schema:'public',table:'map_events'}, load).subscribe(); return ()=>supabase.removeChannel(ch); },[]);
  // night mode auto 18-06
  useEffect(()=>{
    const check=()=>{ try{ const s=JSON.parse(localStorage.getItem('karta_nav_settings')||'{}'); if(s.night_mode==='auto'){ const h=new Date().getHours(); document.documentElement.classList.toggle('dark', h>=18||h<6);} }catch{} };
    check(); const iv=setInterval(check, 60000); return ()=>clearInterval(iv);
  },[]);
  useEffect(() => {
    try { localStorage.setItem(TILE_KEY, String(tileIndex)); } catch {}
  }, [tileIndex]);

  const handleStopPickResult = useCallback((data) => {
    setMapPickResult(data);
    if (!routingOpenRef.current && onRoutingOpen) onRoutingOpen();
    routingOpenRef.current = true;
    setRoutingOpen(true);
    if (onRoutingStateChange) onRoutingStateChange(true);
    if (mapRef.current) mapRef.current.closePopup();
  }, [onRoutingOpen, onRoutingStateChange]);

  // Когда выбран конкретный маршрут транспорта, скрываем личную поездку (синяя OSRM-линия) — это разные сущности
  useEffect(() => {
    if (route) {
      setRoutingRoute(null);
      setRoutingOpen(false);
    }
  }, [route?.id]);

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
    const opening = !routingOpenRef.current;
    if (opening && onRoutingOpen) onRoutingOpen();
    routingOpenRef.current = opening;
    setRoutingOpen(opening);
    if (!opening) { setRoutingRoute(null); setMapPickTarget(null); }
  }, [onRoutingOpen]);

  // уведомляем родителя только при реальной смене routingOpen — колбэк из пропсов
  // пересоздаётся каждый рендер родителя, поэтому держим его в ref, иначе петля эффектов
  const routingStateCbRef = useRef(onRoutingStateChange);
  routingStateCbRef.current = onRoutingStateChange;
  const lastRoutingNotifiedRef = useRef(null);
  useEffect(() => {
    if (lastRoutingNotifiedRef.current === routingOpen) return;
    lastRoutingNotifiedRef.current = routingOpen;
    routingStateCbRef.current?.(routingOpen);
  }, [routingOpen]);

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

  const isHybrid = TILE_LAYERS[tileIndex].isHybrid;
  useEffect(() => {
    if (isHybrid) setShowLabels(true);
  }, [isHybrid]);

  // Fetch OSRM geometry for all routes — строго road geometry, без fallback прямых линий
  useEffect(() => {
    const routesWithCoords = (routes || []).filter(r => {
      const pts = (r.stops || []).filter(s => isValidLatLng(s.lat, s.lng));
      return pts && pts.length >= 2;
    });
    if (routesWithCoords.length === 0) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const cacheKey = (r)=> `${r.id}:${(r.stops||[]).map(s=> s.lat?.toFixed(5)+','+s.lng?.toFixed(5)).join('|')}`;
    const fetchAll = async () => {
      for (const r of routesWithCoords) {
        if (cancelled) break;
        const key = cacheKey(r);
        if (routeGeomCache.has(key)) {
          const cached = routeGeomCache.get(key);
          if (!cancelled) setRouteGeometries(prev => ({ ...prev, [r.id]: cached }));
          continue;
        }
        const pts = r.stops.filter(s => isValidLatLng(s.lat, s.lng));
        // OSRM ожидает lng,lat — проверяем порядок
        const coords = pts.map(s => `${Number(s.lng).toFixed(6)},${Number(s.lat).toFixed(6)}`).join(';');
        if (coords.split(';').length < 2) continue;
        try {
          const resp = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=true`,
            { signal: ctrl.signal }
          );
          if (!resp.ok) {
            console.warn('[BusMap] OSRM no road geometry for', r.number, resp.status);
            continue;
          }
          const data = await resp.json();
          const g = data.routes?.[0]?.geometry?.coordinates;
          if (!g || g.length < 2) continue;
          // GeoJSON: [lng, lat] → Leaflet [lat,lng] — проверяем
          const positions = g.map(([lng, lat]) => {
            if (!isValidLatLng(lat,lng)) return null;
            return [lat, lng];
          }).filter(Boolean);
          if (positions.length < 2) continue;
          routeGeomCache.set(key, positions);
          if (!cancelled) setRouteGeometries(prev => ({ ...prev, [r.id]: positions }));
        } catch (e){
          if(e?.name!=='AbortError') console.warn('[BusMap] OSRM fetch failed', r.number, e.message);
        }
      }
    };
    fetchAll();
    return () => { cancelled = true; ctrl.abort(); };
  }, [routes.map(r=>r.id+':'+(r.stops||[]).length).join(',')]);

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
      <CenterWatcher onCenterChange={onCenterChange} />
      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
      <FlyToHandler flyTo={flyTo} onDone={onFlyDone} />
      <ScaleControl position="bottomleft" imperial={false} metric={true} />
      {!mapPickTarget && <MapControls tileIndex={tileIndex} setTileIndex={setTileIndex} finderActive={routingOpen} onFinderToggle={handleFinderToggle} onShareTrip={onShareTrip} rightOffset={routingOpen ? 400 : panelVisible ? 360 : 0} isNavigating={nav.isActive} onLocate={onLocate} autoCenter={autoCenter} onToggleAutoCenter={()=>{ const v=!autoCenter; window.dispatchEvent(new CustomEvent('karta_autocenter',{detail:v})); }} overviewActive={!nav.followUser} onToggleOverview={()=>nav.toggleFollow()} />}

      {showLabels && (
        <TileLayer
          url={LABEL_OVERLAY_URL}
          opacity={0.95}
          zIndex={400}
        />
      )}

      {/* All routes as polylines — when a route is selected, show only it */}
      {(route ? (routes || []).filter(r => r.id === route.id) : (routes || [])).map(r => {
        const pts = r.stops?.filter(s => isValidLatLng(s.lat, s.lng));
        if (!pts || pts.length < 2) return null;
        const isSelected = !!route;
        const geoPositions = routeGeometries[r.id];
        // не рисуем fallback прямую — ждём road geometry
        if (!geoPositions || geoPositions.length < 2) {
          if (isSelected) {
            // покажем тонкую пунктирную заглушку с сообщением в консоль, но не прямую через здания
            console.log('[BusMap] waiting road geometry for', r.number);
          }
          return null;
        }
        const positions = geoPositions;
        return (
          <Fragment key={r.id}>
            {/* Белая обводка + яркая линия — главный визуальный элемент */}
            <Polyline positions={positions} color="white" weight={isSelected ? 9 : 6} opacity={isSelected ? 0.95 : 0.6} lineCap="round" lineJoin="round" />
            <Polyline positions={positions} color={r.color || '#2563EB'} weight={isSelected ? 6 : 3.5} opacity={isSelected ? 1 : 0.7} lineCap="round" lineJoin="round" />
            <RouteNumberLabel
              positions={positions}
              routeNumber={r.number}
              routeName={r.name}
              color={r.color || '#2563EB'}
            />
          </Fragment>
        );
      })}

      {(() => {
        const sourceRoutes = route ? [route] : routes;
        const allStops = collectUniqueStops(sourceRoutes);
        const markers = allStops.map((stop, idx) => {
          const isWatched = watchedStop && Math.abs(stop.lat - watchedStop.lat) < 0.00012 && Math.abs(stop.lng - watchedStop.lng) < 0.00012;
          const icon = L.divIcon({
            html: isWatched
              ? `<div style="position:relative;width:30px;height:30px;">
                  <div style="position:absolute;inset:0;border-radius:50%;background:rgba(245,158,11,0.35);animation: k-ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></div>
                  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(245,158,11,0.5);border:3px solid #fff;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 18v2"/><path d="M17 18v2"/></svg>
                  </div>
                </div>
                <style>@keyframes k-ping{75%,100%{transform:scale(1.6);opacity:0}}</style>`
              : `<div style="width:22px;height:22px;border-radius:50%;background:#1565C0;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2.5px solid #fff;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 18v2"/><path d="M17 18v2"/></svg>
            </div>`,
            className: '',
            iconSize: isWatched ? [30, 30] : [22, 22],
            iconAnchor: isWatched ? [15, 15] : [11, 11],
          });
          return (
            <Marker key={`stop-all-${idx}`} position={[stop.lat, stop.lng]} icon={icon} zIndexOffset={isWatched ? 1000 : 0} bubblingMouseEvents={false}
              eventHandlers={{ click: () => { try { mapRef.current?.flyTo([stop.lat, stop.lng], Math.max(mapRef.current.getZoom(), 15), { animate: true, duration: 0.5 }); } catch {} try { navigator.vibrate?.(15); } catch {} } }}>
              <Popup maxWidth={300} className="stop-info-popup">
                <StopInfoPopup
                  stop={stop}
                  routes={routes}
                  routeGeometries={routeGeometries}
                  routingOpen={routingOpen}
                  onPickFrom={(s) => handleStopPickResult({ lat: s.lat, lng: s.lng, name: s.name, shortName: s.name, display_name: s.name, city: '', country: '', target: 'from' })}
                  onPickTo={(s) => handleStopPickResult({ lat: s.lat, lng: s.lng, name: s.name, shortName: s.name, display_name: s.name, city: '', country: '', target: 'to' })}
                />
              </Popup>
            </Marker>
          );
        });
        if (!route && allStops.length > 55) {
          return (
            <MarkerClusterGroup
              key={`stops-cluster-${markers.length}-${(selectedRoute?.id) || 'all'}`}
              chunkedLoading={false}
              maxClusterRadius={38}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              animate={false}
            >
              {markers}
            </MarkerClusterGroup>
          );
        }
        return markers;
      })()}

      <OsmStopMarkers
        routes={routes}
        routeGeometries={routeGeometries}
        routingOpen={routingOpen}
        onPickResult={handleStopPickResult}
      />

      {vehicles.filter(v => v.lat && v.lng).map(v => (
        <AnimatedVehicleMarker key={v.id} vehicle={v} route={route} getEtaLabel={getEtaLabel} />
      ))}
      {eventPos && (
        <Marker position={[eventPos[0], eventPos[1]]} icon={L.divIcon({ html:`<div style="width:30px;height:30px;border-radius:50% 50% 50% 0; transform:rotate(-45deg); background:#e10600;border:2px solid #fff; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.3);"><span style="transform:rotate(45deg); color:#fff; font-weight:800; font-size:16px;">—</span></div>`, className:'', iconSize:[30,38], iconAnchor:[15,30]})} zIndexOffset={1000} />
      )}
      {eventLine && eventLine.length>1 && (
        <>
          <Polyline positions={eventLine} color={roadDir===0?'#e10600': roadDir===1?'#059669':'#2563eb'} weight={7} opacity={0.9} dashArray={roadDir===0?'8 8':undefined} lineCap="round" />
          {eventLine.map((p,i)=> (
            <Marker key={`el-${i}`} position={p} icon={L.divIcon({ html:`<div style="width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid ${roadDir===0?'#e10600':roadDir===1?'#059669':'#2563eb'};box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`, className:'', iconSize:[10,10], iconAnchor:[5,5]})} />
          ))}
          {roadDir!==0 && eventLine.length>=2 && (()=>{ const mid=eventLine[Math.floor(eventLine.length/2)]; const icon = L.divIcon({ html:`<div style="font-size:18px; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))">${roadDir===1?'⬆️':'⬇️'}</div>`, className:'', iconSize:[18,18], iconAnchor:[9,9]}); return <Marker position={mid} icon={icon} interactive={false} />; })()}
        </>
      )}
      {!hideEvents && mapEvents.filter(e=>e.lat&&e.lng).map(ev=> {
        const col = ev.type==='accident'?'#ef4444': ev.type==='camera'?'#3b82f6': ev.type==='roadwork'?'#f59e0b': ev.type==='closure'?'#dc2626': ev.type==='hazard'?'#dc2626': ev.type==='traffic'?'#7c3aed': '#64748b';
        const label = ({accident:'ДТП', roadwork:'Ремонт', camera:'Камера', closure:'Перекрытие', hazard:'Опасность', traffic:'Пробка', other:'Другое'}[ev.type] || ev.type);
        const icon = L.divIcon({ html:`<div style="position:relative; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))"><div style="width:28px;height:28px;border-radius:50% 50% 50% 0; transform:rotate(-45deg); background:${col};border:2px solid #fff; display:flex; align-items:center; justify-content:center;"><span style="transform:rotate(45deg); color:#fff; font-weight:800; font-size:14px; line-height:1;">—</span></div><div style="position:absolute; left:50%; bottom:-6px; width:8px;height:8px;background:${col}; transform:rotate(45deg) translateX(-50%); border-right:2px solid #fff; border-bottom:2px solid #fff;"></div></div>`, className:'', iconSize:[28,36], iconAnchor:[14,28]});
        const startStr = ev.created_at ? new Date(ev.created_at).toLocaleString('ru') : '';
        const endStr = ev.expires_at ? new Date(ev.expires_at).toLocaleString('ru') : '';
        const timeLine = endStr ? `${startStr} → ${endStr}` : startStr;
        const photoPublic = ev.photo_url ? `https://eotkmnwneivithfkweds.supabase.co/storage/v1/object/public/reports/${ev.photo_url}` : null;
        // ленивый (.+?) обрезал JSON по первой же ']' и полосы никогда не парсились — жадные скобочные группы
        let lanes = null; try{ const m = ev.description?.match(/\[lanes:(\[.*\])\]/); if(m) lanes = JSON.parse(m[1]); }catch{}
        let lineInfo = null; try{ const m = ev.description?.match(/\[line:(\{.*\})\]/); if(m) lineInfo = JSON.parse(m[1]); }catch{}
        return <Marker key={`evt-${ev.id}`} position={[ev.lat, ev.lng]} icon={icon}><Popup><div style={{fontSize:12, minWidth:190, fontFamily:'Inter,sans-serif'}}><div style={{fontWeight:800, color:col}}>{label}</div>
        {lanes && Array.isArray(lanes) && (
          <div style={{display:'grid', gridTemplateColumns:`repeat(${lanes.length},1fr)`, gap:4, marginTop:6}}>
            {lanes.map((st,i)=>(
              <div key={i} style={{
                aspectRatio:'1', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800,
                background: st==='blocked' ? '#fee2e2' : st==='up' ? '#ecfdf5' : st==='down' ? '#eff6ff' : '#fff',
                border: `1.5px solid ${st==='blocked'?'#ef4444': st==='up'?'#10b981': st==='down'?'#3b82f6':'#e5e7eb'}`,
                color: st==='blocked'?'#e10600': st==='up'?'#059669': st==='down'?'#2563eb':'transparent'
              }}>{st==='blocked'?'✕': st==='up'?'↑': st==='down'?'↓':''}</div>
            ))}
          </div>
        )}
        {lineInfo?.line && <div style={{marginTop:6, fontSize:10, color:'#6b7280'}}>Линия: {lineInfo.line.length} точек · {lineInfo.dir===0?'❌':lineInfo.dir===1?'⬆️':'⬇️'}</div>}
        {photoPublic && <img src={photoPublic} alt="фото" style={{width:'100%', maxHeight:120, objectFit:'cover', borderRadius:8, marginTop:6}} onError={e=>e.currentTarget.style.display='none'} /> }<div style={{color:'#374151', marginTop:6}}>{ev.description ? ev.description.replace(/\s*\[.*?\]\s*/g,'').trim() : ''}</div><div style={{color:'#059669', fontWeight:600, fontSize:11, marginTop:4}}>{timeLine}</div><button onClick={async()=>{ if(!confirm('Удалить?')) return; setMapEvents(prev=>prev.filter(x=>x.id!==ev.id)); mapRef.current?.closePopup(); const {error}=await supabase.from('map_events').update({is_active:false}).eq('id', ev.id); if(error){ const {error:delErr}=await supabase.from('map_events').delete().eq('id', ev.id); if(delErr) toast.error('Не удалось удалить: '+delErr.message);} else toast.success('Удалено'); }} style={{marginTop:8, width:'100%', background:'#fee2e2', color:'#b91c1c', border:'1px solid #fecaca', borderRadius:8, padding:'6px', fontSize:11, fontWeight:700, cursor:'pointer'}}>Удалить</button></div></Popup></Marker>;
      })}



      {/* Built route polyline + markers */}
      {((routingRoute && routingRoute.geometry) || (nav.isActive && nav.routeData && nav.routeData.geometry)) && (
        (() => {
          const navRoute = nav.isActive && nav.routeData ? nav.routeData : routingRoute;
          const positions = navRoute.geometry;
          const isPreview = !nav.isActive;
          return (
            <>
              {/* alternatives as per reference 2 — blue dashed, selectable */}
              {isPreview && routingRoute?.alternatives?.map((alt,i)=> (
                <Polyline
                  key={`alt-${i}`}
                  positions={alt.geometry}
                  color="#60a5fa"
                  weight={6}
                  opacity={0.55}
                  dashArray="12 10"
                  lineCap="round"
                  lineJoin="round"
                  eventHandlers={{ click: ()=> {
                    try{ navigator.vibrate?.(20);}catch{}
                    setRoutingRoute(prev=> ({ ...alt, from: prev.from, to: prev.to, mode: prev.mode, waypoints: prev.waypoints, alternatives: prev.alternatives }));
                    if(alt.geometry?.length) { const b=L.latLngBounds(alt.geometry); mapRef.current?.fitBounds(b, {padding:[40,40]}); }
                  }}}
                />
              ))}
              {isPreview && routingRoute?.alternatives?.[0] && (
                <Marker position={routingRoute.alternatives[0].geometry[Math.floor(routingRoute.alternatives[0].geometry.length/2)]} interactive={false} icon={L.divIcon({ html:`<div style="background:rgba(59,130,246,0.9);color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);">то же время</div>`, className:'', iconSize:[70,18], iconAnchor:[35,9]})} />
              )}
              <Polyline positions={positions} color="white" weight={10} opacity={0.95} lineCap="round" lineJoin="round" />
              <Polyline
                positions={positions}
                color={navRoute.mode === 'walking' ? '#7C3AED' : navRoute.mode === 'cycling' ? '#059669' : isPreview ? '#22c55e' : '#2563EB'}
                weight={6}
                opacity={1}
                lineCap="round"
                lineJoin="round"
              />
              {(() => {
                // ОТ/ДО всегда видны: если точек нет в данных (транзит/рестарт) — берём концы геометрии
                const fp = navRoute.from?.lat != null
                  ? navRoute.from
                  : (positions.length ? { lat: positions[0][0], lng: positions[0][1] } : null);
                const tp = navRoute.to?.lat != null
                  ? navRoute.to
                  : (positions.length ? { lat: positions[positions.length - 1][0], lng: positions[positions.length - 1][1] } : null);
                // подпись ПОД точкой — иначе плашка уезжает под верхнее меню (манёвр/скорость)
                const endIcon = (label, bg, border) => L.divIcon({
                  html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));">`
                    + `<div style="width:24px;height:24px;border-radius:50%;background:${bg};border:3.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`
                    + `<div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:9px solid ${border};margin-top:1px;"></div>`
                    + `<div style="background:#fff;color:${bg};font-size:11px;font-weight:900;padding:3px 10px;border-radius:12px;border:2.5px solid ${border};white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;font-family:Inter,sans-serif;margin-top:-1px;">${label}</div></div>`,
                  className: '', iconSize: [150, 64], iconAnchor: [75, 12],
                });
                const escName = (s) => String(s ?? '').replace(/[<>&"]/g, '');
                return (<>
                  {fp && (
                    <Marker position={[fp.lat, fp.lng]} icon={endIcon(`ОТ · ${escName(fp.shortName || navRoute.fromText || 'Старт').slice(0, 18)}`, '#15803d', '#22c55e')} zIndexOffset={1000}>
                      <Popup><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>📍 ОТ: {fp.shortName || navRoute.fromText || 'Старт'}</div></Popup>
                    </Marker>
                  )}
                  {tp && (
                    <Marker position={[tp.lat, tp.lng]} icon={endIcon(`ДО · ${escName(tp.shortName || navRoute.toText || 'Финиш').slice(0, 18)}`, '#b91c1c', '#ef4444')} zIndexOffset={1000}>
                      <Popup><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>🏁 ДО: {tp.shortName || navRoute.toText || 'Финиш'}</div></Popup>
                    </Marker>
                  )}
                </>);
              })()}
              {navRoute.waypoints && navRoute.waypoints.filter(Boolean).map((wp, i) => (
                <Marker key={`wp-${i}`} position={[wp.lat, wp.lng]} icon={routingIcon}>
                  <Popup><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>➕ {wp.shortName || `Точка ${i + 1}`}</div></Popup>
                </Marker>
              ))}
            </>
          );
        })()
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
        <UserLocationMarker transportMode={routeMeta?.mode || nav.routeData?.mode} />
      )}

      {/* Navigation camera follow + arrow */}
      {nav.isActive && <NavigationCamera followUser={nav.followUser} userPosition={nav.userPosition} reroute={nav.reroute} routeData={nav.routeData} />}

      {/* Group route members — улучшенные маркеры с статусом и направлением */}
      {groupRouteMembers.filter(m => m.lat && m.lng).map((member) => {
        const isCreator = member.role === 'creator';
        const status = member.status || 'online';
        const isMoving = status === 'moving';
        const isOffline = status === 'offline';

        // Цвет по роли
        const color = isCreator ? '#3b82f6' : '#8b5cf6';
        const dotColor = isOffline ? '#64748b' : isMoving ? '#60a5fa' : '#22c55e';
        const borderColor = isOffline ? '#475569' : isCreator ? '#60a5fa' : '#a78bfa';

        // Стрелка направления
        const headingArrow = (member.heading != null && isMoving)
          ? `<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%) rotate(${member.heading}deg);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid ${color};opacity:0.9;"></div>`
          : '';

        // Пульсирующее кольцо если движется
        const pulse = isMoving
          ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${color};opacity:0.4;animation:k-ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></div>`
          : '';

        const html = `
          <div style="position:relative;width:44px;height:44px;">
            ${pulse}
            ${headingArrow}
            <div style="width:44px;height:44px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:3px solid ${borderColor};box-shadow:0 2px 10px rgba(0,0,0,0.35);opacity:${isOffline ? 0.55 : 1};">
              <span style="color:white;font-size:14px;font-weight:800;">${(member.full_name || member.user_id || '?')[0].toUpperCase()}</span>
            </div>
            <div style="position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;background:${dotColor};border-radius:50%;border:2.5px solid white;"></div>
          </div>
          <style>@keyframes k-ping{75%,100%{transform:scale(1.8);opacity:0}}</style>
        `;

        const icon = L.divIcon({ className: '', html, iconSize: [44, 44], iconAnchor: [22, 22] });

        const distLabel = member.distFromMe != null
          ? member.distFromMe >= 1000
            ? `${(member.distFromMe / 1000).toFixed(1)} км`
            : `${Math.round(member.distFromMe)} м`
          : null;
        const etaLabel = member.etaSec != null
          ? Math.round(member.etaSec / 60) < 1 ? '< 1 мин' : `${Math.round(member.etaSec / 60)} мин`
          : null;
        const statusText = isOffline ? 'Оффлайн' : isMoving ? 'В движении' : 'Онлайн';

        return (
          <Marker key={`group-member-${member.user_id}`} position={[member.lat, member.lng]} icon={icon} zIndexOffset={isCreator ? 200 : 100}>
            <Popup maxWidth={220} className="stop-info-popup">
              <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: 'white', fontSize: 13, fontWeight: 800 }}>{(member.full_name || '?')[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{member.full_name || 'Участник'}</div>
                    <div style={{ fontSize: 10, color: isOffline ? '#94a3b8' : isMoving ? '#3b82f6' : '#22c55e', marginTop: 1 }}>{statusText}</div>
                  </div>
                </div>
                {(distLabel || etaLabel) && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, color: '#64748b' }}>
                    {distLabel && <span>📍 {distLabel}</span>}
                    {etaLabel && <span>⏱ {etaLabel} пешком</span>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => { if (mapRef.current) mapRef.current.closePopup(); }}
                    style={{ flex: 1, padding: '5px 0', borderRadius: 8, background: '#f1f5f9', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#475569' }}
                  >
                    👁 На карте
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Contact locations — фиолетовые маркеры друзей поделившихся геолокацией */}
      {contactLocations.filter(c => c.lat && c.lng).map((contact) => {
        const ago = contact.updated_at ? Date.now() - new Date(contact.updated_at).getTime() : Infinity;
        const isStale = ago > 5 * 60 * 1000;
        const isMoving = contact.speed && contact.speed > 1;

        const headingArrow = (contact.heading != null && isMoving)
          ? `<div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%) rotate(${contact.heading}deg);width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:9px solid #7c3aed;opacity:0.85;"></div>`
          : '';

        const html = `
          <div style="position:relative;width:38px;height:38px;">
            ${headingArrow}
            <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;border:3px solid #a78bfa;box-shadow:0 2px 8px rgba(0,0,0,0.3);opacity:${isStale ? 0.5 : 1};">
              <span style="color:white;font-size:12px;font-weight:800;">${(contact.full_name || '?')[0].toUpperCase()}</span>
            </div>
            <div style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;background:${isStale ? '#64748b' : '#22c55e'};border-radius:50%;border:2px solid white;"></div>
          </div>
        `;
        const icon = L.divIcon({ className: '', html, iconSize: [38, 38], iconAnchor: [19, 19] });

        const timeLabel = contact.updated_at
          ? new Date(contact.updated_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
          : '';

        return (
          <Marker key={`contact-${contact.user_id}`} position={[contact.lat, contact.lng]} icon={icon} zIndexOffset={50}>
            <Popup maxWidth={200} className="stop-info-popup">
              <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: 'white', fontSize: 12, fontWeight: 800 }}>{(contact.full_name || '?')[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{contact.full_name}</div>
                    <div style={{ fontSize: 10, color: isStale ? '#94a3b8' : '#22c55e' }}>
                      {isStale ? 'Давно' : isMoving ? 'В движении' : 'Онлайн'}{timeLabel ? ` · ${timeLabel}` : ''}
                    </div>
                  </div>
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
          externalRoute={aiRouteReq}
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
          routes={routes}
          vehicles={vehicles}
        />
      )}

    </div>
  );
}