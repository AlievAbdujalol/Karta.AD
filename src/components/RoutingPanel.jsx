import { useState, useCallback, useRef, useEffect } from 'react';
import { Navigation, MapPin, Plus, X, RotateCcw, Locate, Route, AlertCircle, Loader2, Crosshair, ChevronUp, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

const TRANSPORT_MODES = [
  { id: 'driving', icon: '🚗', label: 'Авто', osrmProfile: 'driving', color: '#2563EB' },
  { id: 'walking', icon: '🚶', label: 'Пешком', osrmProfile: 'walking', color: '#7C3AED' },
  { id: 'cycling', icon: '🚲', label: 'Велосипед', osrmProfile: 'cycling', color: '#059669' },
  { id: 'bus', icon: '🚌', label: 'Автобус', osrmProfile: 'driving', color: '#F59E0B' },
  { id: 'minibus', icon: '🚐', label: 'Маршрутка', osrmProfile: 'driving', color: '#EF4444' },
];

async function searchAddress(query, limit = 5) {
  if (!query || query.length < 2) return [];
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1&accept-language=ru`,
      { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.map(item => ({
      id: item.place_id,
      name: item.display_name,
      shortName: item.display_name.split(',').slice(0, 3).join(','),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
      importance: item.importance,
    }));
  } catch {
    return [];
  }
}

async function buildRoute(from, to, profile = 'driving', waypoints = []) {
  const coords = [from, ...waypoints, to].map(p => `${p.lng},${p.lat}`).join(';');
  try {
    const resp = await fetch(
      `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true&annotations=true`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) throw new Error(`OSRM error: ${resp.status}`);
    const data = await resp.json();
    if (!data.routes || data.routes.length === 0) return null;
    const route = data.routes[0];
    const steps = [];
    if (route.legs) {
      route.legs.forEach((leg, legIdx) => {
        if (leg.steps) {
          leg.steps.forEach(step => {
            steps.push({
              instruction: step.maneuver?.type || '',
              modifier: step.maneuver?.modifier || '',
              name: step.name || '',
              distance: step.distance || 0,
              duration: step.duration || 0,
              start: step.maneuver?.location || [0, 0],
            });
          });
        }
      });
    }
    return {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      steps,
      legs: route.legs,
    };
  } catch (err) {
    console.error('Route build error:', err);
    return null;
  }
}

function SearchInput({ value, onChange, onSelect, placeholder, icon: Icon, iconColor, autoFocus, onPickOnMap }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  const handleChange = useCallback((val) => {
    onChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const results = await searchAddress(val);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setLoading(false);
    }, 400);
  }, [onChange]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl focus-within:border-blue-500 transition-all">
        <Icon size={16} style={{ color: iconColor || '#64748b' }} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent outline-none text-xs font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
        />
        {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
        {onPickOnMap && (
          <button
            onClick={onPickOnMap}
            title="Выбрать на карте"
            className="text-slate-400 hover:text-blue-500 transition-colors"
          >
            <Crosshair size={14} />
          </button>
        )}
        {value && !loading && (
          <button onClick={() => { onChange(''); setSuggestions([]); setShowSuggestions(false); }} className="text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
          {suggestions.map(s => (
            <button
              key={s.id}
              onClick={() => { onSelect(s); setShowSuggestions(false); }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left border-b border-slate-100 dark:border-slate-700/30 last:border-0"
            >
              <MapPin size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">{s.shortName}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{s.type}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationField({ value, placeholder, icon: Icon, iconColor, onPick, onClear, isActive }) {
  return (
    <div className="relative">
      <button
        onClick={onPick}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
          isActive
            ? 'bg-yellow-50/80 dark:bg-yellow-900/10 border-yellow-400 dark:border-yellow-600'
            : 'bg-slate-50 dark:bg-slate-800 border-slate-200/60 dark:border-slate-700/60 hover:border-blue-300 dark:hover:border-blue-600'
        }`}
      >
        <Icon size={16} style={{ color: iconColor || '#64748b' }} className="flex-shrink-0" />
        <span className={`flex-1 text-xs font-medium truncate ${value ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        <span className="text-slate-300 dark:text-slate-600">
          <Crosshair size={12} />
        </span>
      </button>
      {value && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export default function RoutingPanel({ onClose, onRouteBuilt, mapCenter, user, onRequestMapPick, onLocateAndPick, onLocateMe, mapPickResult, mapPickTarget }) {
  const { t } = useLanguage();
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [waypoints, setWaypoints] = useState([]);
  const [waypointTexts, setWaypointTexts] = useState([]);
  const [transportMode, setTransportMode] = useState('driving');
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (mapPickResult && mapPickResult.target) {
      if (mapPickResult.target === 'from') {
        setFrom(mapPickResult);
        setFromText(mapPickResult.shortName);
      } else if (mapPickResult.target === 'to') {
        setTo(mapPickResult);
        setToText(mapPickResult.shortName);
      } else if (mapPickResult.target && mapPickResult.target.startsWith('wp-')) {
        const idx = parseInt(mapPickResult.target.split('-')[1], 10);
        if (!isNaN(idx)) {
          setWaypoints(prev => { const a = [...prev]; a[idx] = mapPickResult; return a; });
          setWaypointTexts(prev => { const a = [...prev]; a[idx] = mapPickResult.shortName; return a; });
        }
      }
    }
  }, [mapPickResult]);

  const handleMyLocation = useCallback(() => {
    onLocateMe?.();
  }, [onLocateMe]);

  const handleBuildRoute = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    const mode = TRANSPORT_MODES.find(m => m.id === transportMode);
    const validWaypoints = waypoints.filter(Boolean);
    const result = await buildRoute(from, to, mode.osrmProfile, validWaypoints);
    if (result) {
      setRouteData({ ...result, mode: transportMode });
      if (onRouteBuilt) onRouteBuilt({ ...result, mode: transportMode, from, to, waypoints: validWaypoints });
    } else {
      setError(t('routeFinder.noRoutesFound') || 'Маршрут не найден');
    }
    setLoading(false);
  }, [from, to, waypoints, transportMode, onRouteBuilt, t]);

  useEffect(() => {
    if (from && to && waypoints.some(w => w !== null)) {
      handleBuildRoute();
    }
  }, [waypoints]);

  useEffect(() => {
    if (from && to) {
      handleBuildRoute();
    }
  }, [from, to, transportMode]);

  const handleSwap = useCallback(() => {
    setFrom(to); setTo(from);
    setFromText(toText); setToText(fromText);
  }, [from, to, fromText, toText]);

  const addWaypoint = useCallback(() => {
    if (waypoints.length >= 8) return;
    setWaypoints(prev => [...prev, null]);
    setWaypointTexts(prev => [...prev, '']);
  }, [waypoints.length]);

  const removeWaypoint = useCallback((idx) => {
    setWaypoints(prev => prev.filter((_, i) => i !== idx));
    setWaypointTexts(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const moveWaypoint = useCallback((fromIdx, toIdx) => {
    setWaypoints(prev => {
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
    setWaypointTexts(prev => {
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
  }, []);

  const formatDistance = (m) => {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} км`;
    return `${Math.round(m)} м`;
  };

  const formatDuration = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    if (h > 0) return `${h} ч ${m} мин`;
    return `${m} мин`;
  };

  const estimateCost = (distance, mode) => {
    const km = distance / 1000;
    if (mode === 'driving') return Math.round(km * 1.5 + 10);
    if (mode === 'bus') return 3;
    if (mode === 'minibus') return 3;
    if (mode === 'walking') return 0;
    if (mode === 'cycling') return 0;
    return Math.round(km * 2 + 15);
  };

  return (
    <div className={`absolute bottom-[72px] left-0 right-0 md:bottom-auto md:left-auto md:top-[140px] md:right-4 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl border-t md:border md:rounded-3xl border-slate-200/60 dark:border-slate-800/80 flex flex-col max-h-[calc(100vh-144px)] md:max-h-[calc(100vh-180px)] md:w-[380px] ${mapPickTarget ? 'hidden' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <Navigation size={18} className="text-blue-600" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Найти маршрут</h2>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* From / To */}
        <div className="relative">
          <div className="absolute left-[17px] top-3 bottom-3 w-0.5 bg-slate-300/60 dark:bg-slate-600/40 rounded-full z-[1]" />
          <div className="space-y-2 relative z-[2]">
            <LocationField
              value={fromText}
              placeholder="Откуда"
              icon={MapPin}
              iconColor="#22c55e"
              onPick={() => onRequestMapPick?.('from')}
              onClear={() => { setFrom(null); setFromText(''); }}
              isActive={mapPickTarget === 'from'}
            />
            {waypoints.map((wp, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveWaypoint(idx, idx - 1)}
                    disabled={idx === 0}
                    className="w-5 h-3.5 rounded flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronUp size={10} className="text-slate-500" />
                  </button>
                  <button
                    onClick={() => moveWaypoint(idx, idx + 1)}
                    disabled={idx === waypoints.length - 1}
                    className="w-5 h-3.5 rounded flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronDown size={10} className="text-slate-500" />
                  </button>
                </div>
                <div className="flex-1">
                  <LocationField
                    value={waypointTexts[idx] || ''}
                    placeholder={`Промежуточная ${idx + 1}`}
                    icon={MapPin}
                    iconColor="#f59e0b"
                    onPick={() => onRequestMapPick?.('wp-' + idx)}
                    onClear={() => { setWaypoints(prev => { const a = [...prev]; a[idx] = null; return a; }); setWaypointTexts(prev => { const a = [...prev]; a[idx] = ''; return a; }); }}
                    isActive={mapPickTarget === 'wp-' + idx}
                  />
                </div>
                <button onClick={() => removeWaypoint(idx)} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-50 text-red-400">
                  <X size={12} />
                </button>
              </div>
            ))}
            <LocationField
              value={toText}
              placeholder="Куда"
              icon={MapPin}
              iconColor="#ef4444"
              onPick={() => onRequestMapPick?.('to')}
              onClear={() => { setTo(null); setToText(''); }}
              isActive={mapPickTarget === 'to'}
            />
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <button onClick={handleSwap} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <RotateCcw size={12} />
            Поменять
          </button>
          <button onClick={handleMyLocation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Locate size={12} />
            Моё местоположение
          </button>
          {waypoints.length < 8 && (
            <button onClick={addWaypoint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <Plus size={12} />
              Точка
            </button>
          )}
        </div>

        {/* Transport modes */}
        <div className="flex gap-1.5 bg-slate-100/80 dark:bg-slate-850 p-1 rounded-xl">
          {TRANSPORT_MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => setTransportMode(mode.id)}
              className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg transition-all ${
                transportMode === mode.id
                  ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-800 dark:text-slate-200'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="text-base">{mode.icon}</span>
              <span className="text-[8px] font-bold mt-0.5">{mode.label}</span>
            </button>
          ))}
        </div>

        {/* Map pick indicator */}
        {mapPickTarget && (
          <div className="flex items-center gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200/50 dark:border-blue-800/30">
            <Crosshair size={16} className="text-blue-600 flex-shrink-0 animate-pulse" />
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
              Переместите карту под прицелом, затем нажмите ✓
            </p>
          </div>
        )}

        {/* Build route button */}
        <button
          onClick={handleBuildRoute}
          disabled={!from || !to || loading}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
            from && to && !loading
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Построение...
            </span>
          ) : (
            'Построить маршрут'
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200/50 dark:border-red-800/30">
            <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>
              <p className="text-[10px] text-red-500/70 mt-1">Попробуйте изменить точки или транспорт</p>
            </div>
          </div>
        )}

        {/* Route result */}
        {routeData && (
          <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 px-1">
              <Route size={14} className="text-blue-600" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Маршрут построен</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center">
                <p className="text-[10px] text-slate-400 mb-0.5">Расстояние</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatDistance(routeData.distance)}</p>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center">
                <p className="text-[10px] text-slate-400 mb-0.5">Время</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatDuration(routeData.duration)}</p>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center">
                <p className="text-[10px] text-slate-400 mb-0.5">Стоимость</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {estimateCost(routeData.distance, routeData.mode) > 0 ? `${estimateCost(routeData.distance, routeData.mode)} TJS` : 'Бесплатно'}
                </p>
              </div>
            </div>

            {/* Steps */}
            {routeData.steps && routeData.steps.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 max-h-40 overflow-y-auto">
                {routeData.steps.slice(0, 20).map((step, i) => {
                  const icons = {
                    turn: '↗️', depart: '🔵', arrive: '🔴', merge: '↗️',
                    'new name': '➡️', 'end of road': '↗️', continue: '⬆️',
                    roundabout: '🔄', rotary: '🔄', 'exit roundabout': '🔄',
                  };
                  const icon = icons[step.instruction] || '➡️';
                  return (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-slate-200/30 dark:border-slate-700/30 last:border-0">
                      <span className="text-sm w-6 text-center">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate">
                          {step.name || (step.instruction === 'depart' ? 'Начало' : step.instruction === 'arrive' ? 'Прибытие' : 'Двигайтесь прямо')}
                        </p>
                      </div>
                      <span className="text-[9px] text-slate-400 flex-shrink-0">{formatDistance(step.distance)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
