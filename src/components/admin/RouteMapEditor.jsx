import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { base44 } from '@/api/base44Client';
import { Save, Trash2, MapPin, Plus, X, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

// Fix default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function ClickHandler({ onMapClick, active }) {
  useMapEvents({
    click(e) {
      if (active) onMapClick(e.latlng);
    },
  });
  return null;
}

export default function RouteMapEditor() {
  const [routes, setRoutes] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [stops, setStops] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stopName, setStopName] = useState('');
  const [pendingStop, setPendingStop] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);

  // Fetch road-snapped route from OSRM
  useEffect(() => {
    if (stops.length < 2) { setRouteGeometry([]); return; }
    const coords = stops.map(s => `${s.lng},${s.lat}`).join(';');
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(data => {
        if (data.routes?.[0]?.geometry?.coordinates) {
          setRouteGeometry(data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]));
        }
      })
      .catch(() => setRouteGeometry(stops.map(s => [s.lat, s.lng])));
  }, [stops]);

  useEffect(() => {
    Promise.all([
      base44.entities.Route.list(),
      base44.entities.City.list(),
    ]).then(([r, c]) => { setRoutes(r); setCities(c); });
  }, []);

  const selectRoute = (route) => {
    setSelectedRoute(route);
    setStops(route.stops ? [...route.stops] : []);
    setAddMode(false);
    setPendingStop(null);
  };

  const handleMapClick = (latlng) => {
    setPendingStop({ lat: latlng.lat, lng: latlng.lng });
    setStopName('');
  };

  const confirmStop = () => {
    if (!pendingStop) return;
    setStops(prev => [...prev, { lat: pendingStop.lat, lng: pendingStop.lng, name: stopName || `Остановка ${prev.length + 1}` }]);
    setPendingStop(null);
    setStopName('');
  };

  const removeStop = (idx) => {
    setStops(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!selectedRoute) return;
    setSaving(true);
    await base44.entities.Route.update(selectedRoute.id, { stops });
    setRoutes(prev => prev.map(r => r.id === selectedRoute.id ? { ...r, stops } : r));
    setSelectedRoute(prev => ({ ...prev, stops }));
    setSaving(false);
    toast.success('Остановки сохранены');
  };

  const getCityName = (id) => cities.find(c => c.id === id)?.name || '';

  const mapCenter = stops.length > 0
    ? [stops[0].lat, stops[0].lng]
    : [38.559, 68.773];

  return (
    <div className="space-y-3">
      {/* Route selector */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <MapPin size={15} className="text-blue-500" />
          Редактор остановок на карте
        </h3>
        <select
          value={selectedRoute?.id || ''}
          onChange={e => {
            const r = routes.find(x => x.id === e.target.value);
            if (r) selectRoute(r);
          }}
          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
        >
          <option value="">— Выберите маршрут —</option>
          {routes.map(r => (
            <option key={r.id} value={r.id}>
              #{r.number} {r.name ? `· ${r.name}` : ''} {getCityName(r.city_id) ? `(${getCityName(r.city_id)})` : ''}
            </option>
          ))}
        </select>

        {selectedRoute && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setAddMode(!addMode); setPendingStop(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                addMode ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'
              }`}
            >
              {addMode ? <X size={13} /> : <Plus size={13} />}
              {addMode ? 'Отменить добавление' : 'Добавить остановку'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white disabled:opacity-60"
            >
              <Save size={13} />
              {saving ? 'Сохраняем...' : `Сохранить (${stops.length})`}
            </button>
            {addMode && (
              <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-1 rounded-lg">
                Кликните на карту, чтобы добавить остановку
              </span>
            )}
          </div>
        )}
      </div>

      {/* Pending stop input */}
      {pendingStop && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <MapPin size={18} className="text-blue-500 flex-shrink-0" />
          <input
            autoFocus
            value={stopName}
            onChange={e => setStopName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmStop()}
            placeholder="Название остановки..."
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />
          <button onClick={confirmStop} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-semibold">
            Добавить
          </button>
          <button onClick={() => setPendingStop(null)} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Map */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100" style={{ height: 400 }}>
        {!selectedRoute ? (
          <div className="h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-2">
            <MapPin size={36} className="text-gray-300" />
            <p className="text-sm">Выберите маршрут для редактирования</p>
          </div>
        ) : (
          <MapContainer
            key={selectedRoute.id}
            center={mapCenter}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            className={addMode ? 'cursor-crosshair' : ''}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            <ClickHandler onMapClick={handleMapClick} active={addMode} />

            {/* Road-snapped polyline */}
            {routeGeometry.length > 1 && (
              <Polyline
                positions={routeGeometry}
                color={selectedRoute.color || '#1565C0'}
                weight={5}
                opacity={0.85}
              />
            )}
            {routeGeometry.length < 2 && stops.length > 1 && (
              <Polyline
                positions={stops.map(s => [s.lat, s.lng])}
                color={selectedRoute.color || '#1565C0'}
                weight={3}
                opacity={0.4}
                dashArray="6 6"
              />
            )}

            {/* Stop markers */}
            {stops.map((stop, i) => (
              <CircleMarker
                key={i}
                center={[stop.lat, stop.lng]}
                radius={10}
                pathOptions={{
                  fillColor: selectedRoute.color || '#1565C0',
                  fillOpacity: 1,
                  color: '#fff',
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-sm space-y-1">
                    <p className="font-semibold">{stop.name || `Остановка ${i + 1}`}</p>
                    <p className="text-gray-500 text-xs">#{i + 1} · {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}</p>
                    <button
                      onClick={() => removeStop(i)}
                      className="flex items-center gap-1 text-red-500 text-xs font-medium hover:text-red-700"
                    >
                      <Trash2 size={11} /> Удалить
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Pending stop preview */}
            {pendingStop && (
              <Marker position={[pendingStop.lat, pendingStop.lng]} opacity={0.6} />
            )}
          </MapContainer>
        )}
      </div>

      {/* Stops list */}
      {stops.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-2">Список остановок ({stops.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-50 group">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ background: selectedRoute?.color || '#1565C0' }}
                >
                  {i + 1}
                </div>
                <span className="flex-1 text-xs text-gray-700">{stop.name || `Остановка ${i + 1}`}</span>
                <button
                  onClick={() => removeStop(i)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}