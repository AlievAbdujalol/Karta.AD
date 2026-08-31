import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Route, City } from '@/api/entities';
import { Save, Trash2, MapPin, Plus, X, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeStopIcon(index, color, isActive) {
  const bg = color || '#1565C0';
  const border = isActive ? '#f59e0b' : '#fff';
  const scale = isActive ? 'scale(1.2)' : 'scale(1)';
  return L.divIcon({
    className: '',
    html: `<div style="transform:${scale};transition:transform 0.15s;position:relative;">
      <div style="width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:3px solid ${border};font-family:system-ui;">${index + 1}</div>
      ${index === 0 ? '<div style="position:absolute;top:-8px;right:-8px;width:14px;height:14px;background:#22c55e;border-radius:50%;border:2px solid #fff;font-size:7px;color:#fff;display:flex;align-items:center;justify-content:center;">A</div>' : ''}
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

function ClickHandler({ onMapClick, active }) {
  useMapEvents({
    click(e) {
      if (active) onMapClick(e.latlng);
    },
  });
  return null;
}

export default function RouteMapEditor() {
  const { t } = useLanguage();
  const [routes, setRoutes] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [stops, setStops] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stopName, setStopName] = useState('');
  const [pendingStop, setPendingStop] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [satellite, setSatellite] = useState(false);
  const [editingStopIdx, setEditingStopIdx] = useState(null);
  const [editStopName, setEditStopName] = useState('');
  const [activeStopIdx, setActiveStopIdx] = useState(null);

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
      Route.list(),
      City.list(),
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
    setStops(prev => [...prev, { lat: pendingStop.lat, lng: pendingStop.lng, name: stopName || `${t('admin.mapEditor.stopDefaultName')} ${prev.length + 1}` }]);
    setPendingStop(null);
    setStopName('');
  };

  const removeStop = (idx) => {
    setStops(prev => prev.filter((_, i) => i !== idx));
  };

  const renameStop = (idx, newName) => {
    setStops(prev => prev.map((s, i) => i === idx ? { ...s, name: newName } : s));
    setEditingStopIdx(null);
  };

  const moveStop = (idx, newLat, newLng) => {
    setStops(prev => prev.map((s, i) => i === idx ? { ...s, lat: newLat, lng: newLng } : s));
  };

  const handleSave = async () => {
    if (!selectedRoute) return;
    setSaving(true);
    await Route.update(selectedRoute.id, { stops });
    setRoutes(prev => prev.map(r => r.id === selectedRoute.id ? { ...r, stops } : r));
    setSelectedRoute(prev => ({ ...prev, stops }));
    setSaving(false);
    toast.success(t('admin.mapEditor.stopsSaved'));
  };

  const getCityName = (id) => cities.find(c => c.id === id)?.name || '';

  const mapCenter = stops.length > 0
    ? [stops[0].lat, stops[0].lng]
    : [38.559, 68.773];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <MapPin size={15} className="text-blue-500" />
          {t('admin.mapEditor.title')}
        </h3>
        <select
          value={selectedRoute?.id || ''}
          onChange={e => {
            const r = routes.find(x => x.id === e.target.value);
            if (r) selectRoute(r);
          }}
          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white text-gray-800"
        >
          <option value="">{t('admin.mapEditor.selectRoutePlaceholder')}</option>
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
              {addMode ? t('admin.mapEditor.cancelAdd') : t('admin.mapEditor.addStop')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white disabled:opacity-60"
            >
              <Save size={13} />
              {saving ? t('admin.mapEditor.saving') : `${t('admin.mapEditor.saveButton')} (${stops.length})`}
            </button>
            {addMode && (
              <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-1 rounded-lg">
                {t('admin.mapEditor.clickHint')}
              </span>
            )}
          </div>
        )}
      </div>

      {pendingStop && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <MapPin size={18} className="text-blue-500 flex-shrink-0" />
          <input
            autoFocus
            value={stopName}
            onChange={e => setStopName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmStop()}
            placeholder={t('admin.mapEditor.stopNamePlaceholder')}
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />
          <button onClick={confirmStop} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-semibold">
            {t('admin.mapEditor.addButton')}
          </button>
          <button onClick={() => setPendingStop(null)} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mb-1">
        <button
          onClick={() => setSatellite(!satellite)}
          className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
            satellite ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {satellite ? t('admin.mapEditor.satelliteOn') : t('admin.mapEditor.satelliteOff')}
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100" style={{ height: 400 }}>
        {!selectedRoute ? (
          <div className="h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-2">
            <MapPin size={36} className="text-gray-300" />
            <p className="text-sm">{t('admin.mapEditor.noRouteSelected')}</p>
          </div>
        ) : (
          <MapContainer
            key={selectedRoute.id}
            center={mapCenter}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            className={addMode ? 'cursor-crosshair' : ''}
            attributionControl={false}
          >
            <TileLayer
              url={satellite ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2m2c_1_fd237f9c15572ee356a4aa42'}
              attribution={satellite ? '&copy; Esri' : '&copy; OpenStreetMap contributors &copy; CARTO'}
            />
            {satellite && (
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
                attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                opacity={1}
              />
            )}
            <ClickHandler onMapClick={handleMapClick} active={addMode} />

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

            {stops.map((stop, i) => (
              <Marker
                key={`stop-${i}-${stop.lat}-${stop.lng}`}
                position={[stop.lat, stop.lng]}
                icon={makeStopIcon(i, selectedRoute?.color, activeStopIdx === i)}
                draggable={!addMode}
                eventHandlers={{
                  dragstart: () => setActiveStopIdx(i),
                  dragend: (e) => {
                    const pos = e.target.getLatLng();
                    moveStop(i, pos.lat, pos.lng);
                    setActiveStopIdx(null);
                  },
                  click: () => setActiveStopIdx(i),
                }}
              >
                <Popup closeButton={false} className="stop-popup">
                  <div style={{ minWidth: 160, fontFamily: 'system-ui' }}>
                    {editingStopIdx === i ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editStopName}
                          onChange={(e) => setEditStopName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') renameStop(i, editStopName); if (e.key === 'Escape') setEditingStopIdx(null); }}
                          style={{ fontSize: 13, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 8, flex: 1, outline: 'none' }}
                        />
                        <button onClick={() => renameStop(i, editStopName)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mb-1">
                        <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{stop.name || `Остановка ${i + 1}`}</p>
                        <button
                          onClick={() => { setEditingStopIdx(i); setEditStopName(stop.name || `Остановка ${i + 1}`); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 2 }}
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
                      #{i + 1} · {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
                    </p>
                    <p style={{ fontSize: 10, color: '#9ca3af', margin: '2px 0 0' }}>
                      Перетащите для перемещения
                    </p>
                    <button
                      onClick={() => removeStop(i)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ef4444', fontSize: 12, fontWeight: 600, marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <Trash2 size={11} /> Удалить
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}

            {pendingStop && (
              <Marker position={[pendingStop.lat, pendingStop.lng]} opacity={0.6} />
            )}
          </MapContainer>
        )}
      </div>

      {stops.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-2">{t('admin.mapEditor.stopListTitle', { count: stops.length })}</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-50 group">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ background: selectedRoute?.color || '#1565C0' }}
                >
                  {i + 1}
                </div>
                {editingStopIdx === `list-${i}` ? (
                  <input
                    autoFocus
                    value={editStopName}
                    onChange={(e) => setEditStopName(e.target.value)}
                    onBlur={() => renameStop(i, editStopName)}
                    onKeyDown={(e) => { if (e.key === 'Enter') renameStop(i, editStopName); if (e.key === 'Escape') setEditingStopIdx(null); }}
                    className="flex-1 text-xs border border-blue-300 rounded-lg px-2 py-1 outline-none"
                  />
                ) : (
                  <span
                    className="flex-1 text-xs text-gray-700 cursor-text hover:text-blue-600"
                    onClick={() => { setEditingStopIdx(`list-${i}`); setEditStopName(stop.name || `Остановка ${i + 1}`); }}
                  >
                    {stop.name || `Остановка ${i + 1}`}
                  </span>
                )}
                <button
                  onClick={() => { setEditingStopIdx(`list-${i}`); setEditStopName(stop.name || `Остановка ${i + 1}`); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-all"
                >
                  <Pencil size={12} />
                </button>
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
