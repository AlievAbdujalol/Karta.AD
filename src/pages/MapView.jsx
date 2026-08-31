import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Route, Vehicle } from '@/api/entities';
import { useLanguage } from '@/lib/useLanguage';
import { ArrowLeft, Bus, RefreshCw } from 'lucide-react';

// Fix leaflet icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const busIcon = (number, type) => L.divIcon({
  html: `<div style="background:${type === 'bus' ? '#1565C0' : '#FF6D00'};color:white;padding:4px 8px;border-radius:8px;font-weight:bold;font-size:13px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">${number}</div>`,
  className: '',
  iconAnchor: [20, 15],
});

const stopIcon = L.divIcon({
  html: `<div style="width:12px;height:12px;background:#fff;border:3px solid #1565C0;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
  className: '',
  iconAnchor: [6, 6],
});

export default function MapView() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [route, setRoute] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const intervalRef = useRef(null);

  const fetchVehicles = async () => {
    const all = await Vehicle.filter({ route_id: routeId, is_active: true });
    setVehicles(all);
  };

  useEffect(() => {
    if (routeId) {
      Route.get(routeId).then(setRoute);
      fetchVehicles();
      intervalRef.current = setInterval(fetchVehicles, 5000);
    }
    return () => clearInterval(intervalRef.current);
  }, [routeId]);

  const stops = route?.stops || [];
  const center = stops.length > 0
    ? [stops[0].lat, stops[0].lng]
    : [38.5581, 68.7738]; // Dushanbe default

  const [routeGeometry, setRouteGeometry] = useState([]);

  useEffect(() => {
    const stopCoords = stops.filter(s => s.lat && s.lng);
    if (stopCoords.length < 2) { setRouteGeometry([]); return; }
    const coords = stopCoords.map(s => `${s.lng},${s.lat}`).join(';');
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(data => {
        if (data.routes?.[0]?.geometry?.coordinates) {
          setRouteGeometry(data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]));
        }
      })
      .catch(() => setRouteGeometry(stopCoords.map(s => [s.lat, s.lng])));
  }, [route]);

  const polylinePositions = routeGeometry.length > 1 ? routeGeometry : stops.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]);

  return (
    <div className="flex flex-col flex-1 relative">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-white/95 backdrop-blur-sm shadow-md px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        {route && (
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white text-sm ${
              route.type === 'bus' ? 'bg-blue-700' : 'bg-orange-500'
            }`}>
              {route.number}
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-800">
                {route.name || `${t(route.type === 'bus' ? 'bus' : 'minibus')} №${route.number}`}
              </p>
              <p className="text-xs text-gray-500">
                {vehicles.length} {t('activeDrivers')}
              </p>
            </div>
          </div>
        )}
        <button onClick={fetchVehicles} className="p-1.5 rounded-lg hover:bg-gray-100 text-blue-600">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Map */}
      <div className="flex-1" style={{ paddingTop: '70px' }}>
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2m2c_1_fd237f9c15572ee356a4aa42"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          {/* Route polyline */}
          {polylinePositions.length > 1 && (
            <Polyline positions={polylinePositions} color="#1565C0" weight={4} opacity={0.7} dashArray="8 4" />
          )}

          {/* Stops */}
          {stops.map((stop, i) => stop.lat && stop.lng && (
            <Marker key={i} position={[stop.lat, stop.lng]} icon={stopIcon}>
              <Popup>
                <div className="text-sm font-medium">{stop.name}</div>
              </Popup>
            </Marker>
          ))}

          {/* Vehicles */}
          {vehicles.map(v => v.lat && v.lng && (
            <Marker key={v.id} position={[v.lat, v.lng]} icon={busIcon(v.route_number || route?.number, v.type)}>
              <Popup>
                <div className="text-sm">
                  <strong>{v.driver_name}</strong><br />
                  №{v.route_number} — {t(v.type === 'bus' ? 'bus' : 'minibus')}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* No buses notice */}
      {vehicles.length === 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-2 text-sm text-gray-600 border border-gray-200">
          <Bus size={18} className="text-gray-400" />
          {t('noBusesOnRoute')}
        </div>
      )}
    </div>
  );
}