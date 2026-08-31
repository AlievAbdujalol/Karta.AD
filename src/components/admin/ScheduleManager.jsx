import { useState, useEffect, useRef } from 'react';
import { Schedule } from '@/api/entities';
import { Plus, Trash2, Save, X, Clock, Pencil, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';

function getLetter(idx) {
  return String(idx + 1);
}

function StopBadge({ idx, color }) {
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow"
      style={{ background: color || '#1565C0' }}
    >
      {getLetter(idx)}
    </div>
  );
}

function MapPicker({ stops, onSelect, onClose, color, selectedIndex, onAddNew }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const lineRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || mapRef.current._leaflet_id) return;

    import('leaflet').then((L) => {
      if (!mapRef.current || mapRef.current._leaflet_id || mapInstanceRef.current) return;
      delete L.default.Icon.Default.prototype._getIconUrl;
      L.default.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const center = stops.length > 0 ? [stops[0].lat, stops[0].lng] : [38.559, 68.773];
      const map = L.default.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(center, 13);
      mapInstanceRef.current = map;

      L.default.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2m2c_1_fd237f9c15572ee356a4aa42', { subdomains: 'abcd' }).addTo(map);

      // Click on map to add new stop
      map.on('click', (e) => {
        onAddNew(e.latlng.lat, e.latlng.lng);
      });

      stops.forEach((stop, i) => {
        const icon = L.default.divIcon({
          className: '',
          html: `<div style="width:32px;height:32px;border-radius:50%;background:${color || '#1565C0'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:3px solid #fff;font-family:system-ui;cursor:pointer;">${i + 1}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.default.marker([stop.lat, stop.lng], { icon }).addTo(map);
        marker.on('click', (e) => {
          L.default.DomEvent.stopPropagation(e);
          onSelect(stop, i);
        });
        marker.bindTooltip(stop.name || `Остановка ${i + 1}`, {
          permanent: false, direction: 'top', offset: [0, -18], className: 'stop-tooltip',
        });
      });

      // OSRM route line
      if (stops.length >= 2) {
        const coords = stops.map(s => `${s.lng},${s.lat}`).join(';');
        fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
          .then(r => r.json())
          .then(data => {
            if (data.routes?.[0]?.geometry?.coordinates) {
              const geom = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
              lineRef.current = L.default.polyline(geom, { color: color || '#1565C0', weight: 5, opacity: 0.8 }).addTo(map);
            }
          })
          .catch(() => {
            const fallback = stops.map(s => [s.lat, s.lng]);
            lineRef.current = L.default.polyline(fallback, { color: color || '#1565C0', weight: 4, opacity: 0.5, dashArray: '6 6' }).addTo(map);
          });
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-blue-600" />
            <p className="font-bold text-sm text-gray-800">
              Выберите остановку для <span style={{ color }}>{getLetter(selectedIndex)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div ref={mapRef} className="flex-1 min-h-[300px]" />
        <div className="px-4 py-3 border-t flex-shrink-0">
          <p className="text-[11px] text-gray-400 text-center">Нажмите на маркер — выбрать · Нажмите на карту — добавить остановку</p>
        </div>
      </div>
    </div>
  );
}

export default function ScheduleManager({ route, onClose }) {
  const { t } = useLanguage();
  const [schedule, setSchedule] = useState(null);
  const [stops, setStops] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [pickingIdx, setPickingIdx] = useState(null);

  useEffect(() => {
    if (!route) return;
    const routeStops = (route.stops || []).map((s, i) => ({
      stop_index: i,
      stop_name: s.name || `Остановка ${i + 1}`,
      times: [],
      price_from_prev: '',
    }));

    Schedule.filter({ route_id: route.id }).then(res => {
      if (res[0]) {
        setSchedule(res[0]);
        const merged = routeStops.map(rs => {
          const existing = res[0].stops_schedule?.find(x => x.stop_index === rs.stop_index);
          return existing
            ? { ...rs, stop_name: existing.stop_name || rs.stop_name, times: existing.times || [], price_from_prev: existing.price_from_prev ?? '' }
            : rs;
        });
        setStops(merged);
      } else {
        setSchedule(null);
        setStops(routeStops);
      }
    });
  }, [route?.id]);

  const updateStop = (stopIndex, field, value) => {
    setStops(prev => prev.map(s =>
      s.stop_index === stopIndex ? { ...s, [field]: value } : s
    ));
  };

  const addTime = (stopIndex) => {
    setStops(prev => prev.map(s =>
      s.stop_index === stopIndex ? { ...s, times: [...s.times, ''] } : s
    ));
  };

  const updateTime = (stopIndex, timeIdx, value) => {
    setStops(prev => prev.map(s =>
      s.stop_index === stopIndex
        ? { ...s, times: s.times.map((t, i) => i === timeIdx ? value : t) }
        : s
    ));
  };

  const removeTime = (stopIndex, timeIdx) => {
    setStops(prev => prev.map(s =>
      s.stop_index === stopIndex
        ? { ...s, times: s.times.filter((_, i) => i !== timeIdx) }
        : s
    ));
  };

  const calcPriceToStop = (stopIndex) => {
    const p = parseFloat(stops[stopIndex]?.price_from_prev);
    return isNaN(p) ? 0 : p;
  };

  const addStop = () => {
    const newStop = { stop_index: stops.length, stop_name: `Остановка ${stops.length + 1}`, times: [], price_from_prev: '' };
    setStops(prev => [...prev, newStop]);
  };

  const removeStop = (stopIndex) => {
    setStops(prev => prev.filter((_, i) => i !== stopIndex).map((s, i) => ({ ...s, stop_index: i })));
  };

  const handlePickStop = (routeStop) => {
    if (pickingIdx == null) return;
    updateStop(pickingIdx, 'stop_name', routeStop.name || `Остановка ${pickingIdx + 1}`);
    setPickingIdx(null);
    toast.success(`Привязано: ${routeStop.name || `Остановка ${pickingIdx + 1}`}`);
  };

  const handleAddNewOnMap = async (lat, lng) => {
    let name = `Остановка ${stops.length + 1}`;
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`,
        { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(3000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        name = data.display_name?.split(',').slice(0, 2).join(',') || name;
      }
    } catch {}
    const newStop = { stop_index: stops.length, stop_name: name, times: [], price_from_prev: '' };
    setStops(prev => [...prev, newStop]);
    toast.success(`Добавлена: ${name}`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        route_id: route.id,
        route_number: route.number,
        city_id: route.city_id,
        stops_schedule: stops.map(s => ({
          stop_index: s.stop_index,
          stop_name: s.stop_name,
          times: s.times.filter(t => t.trim()).sort(),
          price_from_prev: s.price_from_prev ? parseFloat(s.price_from_prev) : null,
        })),
      };
      if (schedule) {
        await Schedule.update(schedule.id, data);
      } else {
        await Schedule.create(data);
      }
      toast.success('Расписание сохранено.');
    } catch (e) {
      toast.error(e.message || 'Ошибка сохранения.');
    } finally {
      setSaving(false);
      onClose();
    }
  };

  if (!route.stops?.length) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
          <p className="text-gray-500 text-sm">{t('admin.schedule.noStopsMessage')}</p>
          <button onClick={onClose} className="mt-4 bg-gray-100 px-4 py-2 rounded-xl text-sm font-medium">{t('admin.schedule.closeButton')}</button>
        </div>
      </div>
    );
  }

  const routeColor = route.color || '#1565C0';
  const routeStops = route.stops || [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-600" />
            <h2 className="font-bold text-gray-800">{t('admin.schedule.title')} #{route.number}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {stops.map((stop, idx) => {
            const cumPrice = calcPriceToStop(idx);
            const isEditing = editingIdx === idx;
            return (
              <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2">
                {/* Header: badge + name + time button */}
                <div className="flex items-center gap-2">
                  <StopBadge idx={idx} color={routeColor} />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={stop.stop_name}
                      onChange={e => updateStop(stop.stop_index, 'stop_name', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') setEditingIdx(null); }}
                      onBlur={() => setEditingIdx(null)}
                      className="flex-1 text-sm font-semibold border border-blue-300 rounded-lg px-2 py-1 outline-none text-gray-800"
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm font-semibold text-gray-800 cursor-pointer hover:text-blue-600"
                      onClick={() => setEditingIdx(idx)}
                    >
                      {stop.stop_name}
                    </span>
                  )}
                  <button onClick={() => setEditingIdx(isEditing ? null : idx)} className="text-gray-400 hover:text-blue-500">
                    <Pencil size={13} />
                  </button>
                  {stops.length > 1 && (
                    <button onClick={() => removeStop(idx)} className="text-gray-400 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  )}
                  <button onClick={() => addTime(stop.stop_index)}
                    className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800 whitespace-nowrap">
                    <Plus size={12} /> {t('admin.schedule.addTimeButton')}
                  </button>
                </div>

                {/* Times */}
                {stop.times.length > 0 && (
                  <div className="flex flex-wrap gap-1 ml-10">
                    {stop.times.map((time, ti) => (
                      <div key={ti} className="flex items-center gap-1 bg-blue-50 rounded-lg px-2 py-1">
                        <input type="time" value={time}
                          onChange={e => updateTime(stop.stop_index, ti, e.target.value)}
                          className="text-xs text-blue-700 font-medium bg-transparent border-none outline-none w-20" />
                        <button onClick={() => removeTime(stop.stop_index, ti)}
                          className="text-gray-400 hover:text-red-500">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Segment label + price */}
                {idx === 0 ? (
                  <div className="ml-10 flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Старт</span>
                  </div>
                ) : (
                  <div className="ml-10 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-medium">
                      <button
                        onClick={() => setPickingIdx(idx - 1)}
                        className="hover:text-blue-600 cursor-pointer underline decoration-dotted underline-offset-2"
                      >{stops[idx - 1]?.stop_name || getLetter(idx - 1)}</button>
                      <span className="text-gray-400">→</span>
                      <button
                        onClick={() => setPickingIdx(idx)}
                        className="hover:text-blue-600 cursor-pointer underline decoration-dotted underline-offset-2"
                      >{stop.stop_name || getLetter(idx)}</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 whitespace-nowrap">Цена:</label>
                      <input type="number" step="0.01" min="0" value={stop.price_from_prev}
                        onChange={e => updateStop(stop.stop_index, 'price_from_prev', e.target.value)}
                        placeholder="напр. 5"
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-20 bg-white text-gray-900 text-center font-bold"
                      />
                      <span className="text-xs text-gray-500">{t('admin.schedule.currencyLabel')}</span>
                      <span className="text-[11px] text-emerald-700 ml-auto bg-emerald-50 px-2 py-1 rounded-lg font-medium">
                        Итого: {cumPrice.toFixed(2)} {t('admin.schedule.currencyLabel')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t flex-shrink-0 space-y-2">
          <button onClick={addStop}
            className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-600 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
            <Plus size={14} /> Добавить остановку
          </button>
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            <Save size={16} />
            {saving ? t('admin.schedule.saving') : t('admin.schedule.saveButton')}
          </button>
        </div>
      </div>

      {/* Map picker modal */}
      {pickingIdx != null && (
        <MapPicker
          stops={routeStops}
          onSelect={handlePickStop}
          onClose={() => setPickingIdx(null)}
          color={routeColor}
          selectedIndex={pickingIdx}
          onAddNew={handleAddNewOnMap}
        />
      )}
    </div>
  );
}
