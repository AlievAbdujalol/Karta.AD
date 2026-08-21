import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Navigation, MapPin, Plus, X, RotateCw, Route, AlertCircle, Loader2, Crosshair,
  ChevronUp, ChevronDown, Play, Car, Bike, PersonStanding, Search, Clock3,
  Sparkles, ArrowLeftRight, Trash2, LocateFixed, Share2, Copy, Check, GripVertical,
  Bus, Truck, Volume2, VolumeX, Timer, Flag, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/lib/useLanguage';
import { useNavigation } from '@/lib/NavigationContext';
import { toast } from 'sonner';

const TRANSPORT_MODES = [
  { id: 'driving', icon: Car, emoji: '🚗', label: 'Авто', shortLabel: 'Авто', osrmProfile: 'driving', color: '#2563EB', bg: 'bg-blue-600' },
  { id: 'taxi', icon: Car, emoji: '🚕', label: 'Такси', shortLabel: 'Такси', osrmProfile: 'driving', color: '#F59E0B', bg: 'bg-amber-500' },
  { id: 'walking', icon: PersonStanding, emoji: '🚶', label: 'Пешком', shortLabel: 'Пешком', osrmProfile: 'walking', color: '#7C3AED', bg: 'bg-violet-600' },
  { id: 'cycling', icon: Bike, emoji: '🚲', label: 'Вело', shortLabel: 'Вело', osrmProfile: 'cycling', color: '#059669', bg: 'bg-emerald-600' },
  { id: 'bus', icon: Bus, emoji: '🚌', label: 'Автобус', shortLabel: 'Автобус', osrmProfile: 'driving', color: '#EA580C', bg: 'bg-orange-600' },
  { id: 'minibus', icon: Truck, emoji: '🚐', label: 'Маршрутка', shortLabel: 'Маршрутка', osrmProfile: 'driving', color: '#DC2626', bg: 'bg-red-600' },
];

const RECENT_KEY = 'karta_route_recent_v1';
const STORAGE_FROM_KEY = 'karta_route_from';
const STORAGE_TO_KEY = 'karta_route_to';

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
      shortName: item.display_name.split(',').slice(0, 3).join(', '),
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
      route.legs.forEach((leg) => {
        if (leg.steps) {
          leg.steps.forEach(step => {
            steps.push({
              instruction: step.maneuver?.type || '',
              modifier: step.maneuver?.modifier || '',
              name: step.name || '',
              distance: step.distance || 0,
              duration: step.duration || 0,
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

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(place) {
  try {
    const cur = getRecent().filter(p => !(Math.abs(p.lat - place.lat) < 0.0005 && Math.abs(p.lng - place.lng) < 0.0005));
    cur.unshift({ shortName: place.shortName, lat: place.lat, lng: place.lng, name: place.name || place.shortName });
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 6)));
  } catch {}
}

/* ---------- Unified searchable field ---------- */
function PlaceField({ value, onChangeText, onPickPlace, placeholder, icon: Icon, iconColor, isActive, onRequestMapPick, autoFocus }) {
  const [suggestions, setSuggestions] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);

  const showDropdown = focused && (suggestions.length > 0 || (recent.length > 0 && value.length < 2));

  const handleChange = useCallback((val) => {
    onChangeText(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const results = await searchAddress(val);
      setSuggestions(results);
      setLoading(false);
    }, 350);
  }, [onChangeText]);

  useEffect(() => {
    if (focused && value.length < 2) setRecent(getRecent());
  }, [focused, value.length]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="relative">
      <div className={`flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border-2 bg-white dark:bg-slate-800 transition-all ${isActive ? 'border-amber-400 dark:border-amber-500 bg-amber-50/50 dark:bg-amber-500/10 shadow-md' : focused ? 'border-blue-500 dark:border-blue-500 shadow-md shadow-blue-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
        <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${iconColor}15`, color: iconColor }}>
          <Icon size={16} />
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent outline-none text-[13px] font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-medium min-w-0"
        />
        {loading && <Loader2 size={14} className="animate-spin text-slate-400 flex-shrink-0" />}
        {!loading && value && (
          <button onClick={() => { onChangeText(''); setSuggestions([]); }} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex-shrink-0">
            <X size={12} className="text-slate-500" />
          </button>
        )}
        <button
          onClick={onRequestMapPick}
          title="Выбрать на карте"
          className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all flex-shrink-0 ${isActive ? 'bg-amber-500 border-amber-500 text-white shadow' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-blue-400 hover:text-blue-600'}`}
        >
          <Crosshair size={13} strokeWidth={2.2} />
        </button>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden">
          {suggestions.length > 0 ? (
            <div className="max-h-56 overflow-y-auto py-1">
              <p className="px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-400">Результаты поиска</p>
              {suggestions.map(s => (
                <button
                  key={s.id}
                  onMouseDown={(e) => { e.preventDefault(); onPickPlace(s); setSuggestions([]); }}
                  className="w-full flex items-start gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin size={12} className="text-slate-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-900 dark:text-white leading-tight truncate">{s.shortName}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{s.type} · {s.name.slice(0, 80)}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-1">
              <p className="px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-400 flex items-center gap-1.5"><Clock3 size={10} /> Недавние</p>
              {recent.length === 0 ? (
                <p className="px-3.5 py-3 text-xs text-slate-500">Нет недавних мест — начните вводить адрес</p>
              ) : recent.map((r, idx) => (
                <button
                  key={idx}
                  onMouseDown={(e) => { e.preventDefault(); onPickPlace(r); }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left"
                >
                  <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Clock3 size={12} className="text-blue-600" />
                  </span>
                  <span className="text-[12px] font-medium text-slate-800 dark:text-slate-200 truncate">{r.shortName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- main panel ---------- */
export default function RoutingPanel({ onClose, onRouteBuilt, onStartNavigation, mapCenter, user, onRequestMapPick, onLocateAndPick, onLocateMe, mapPickResult, mapPickTarget }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
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
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const navCtl = useNavigation();

  // map pick -> fill fields
  useEffect(() => {
    if (mapPickResult && mapPickResult.target) {
      if (mapPickResult.target === 'from') {
        setFrom(mapPickResult); setFromText(mapPickResult.shortName); pushRecent(mapPickResult);
      } else if (mapPickResult.target === 'to') {
        setTo(mapPickResult); setToText(mapPickResult.shortName); pushRecent(mapPickResult);
      } else if (mapPickResult.target.startsWith('wp-')) {
        const idx = parseInt(mapPickResult.target.split('-')[1], 10);
        if (!isNaN(idx)) {
          setWaypoints(prev => { const a = [...prev]; a[idx] = mapPickResult; return a; });
          setWaypointTexts(prev => { const a = [...prev]; a[idx] = mapPickResult.shortName; return a; });
          pushRecent(mapPickResult);
        }
      }
    }
  }, [mapPickResult]);

  // persist from/to
  useEffect(() => {
    try {
      const f = localStorage.getItem(STORAGE_FROM_KEY);
      const t = localStorage.getItem(STORAGE_TO_KEY);
      if (f && !from && !fromText) {
        const p = JSON.parse(f);
        if (p?.lat && p?.lng) { setFrom(p); setFromText(p.shortName || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`); }
      }
      if (t && !to && !toText) {
        const p = JSON.parse(t);
        if (p?.lat && p?.lng) { setTo(p); setToText(p.shortName || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`); }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (from) localStorage.setItem(STORAGE_FROM_KEY, JSON.stringify(from));
      else localStorage.removeItem(STORAGE_FROM_KEY);
    } catch {}
  }, [from]);
  useEffect(() => {
    try {
      if (to) localStorage.setItem(STORAGE_TO_KEY, JSON.stringify(to));
      else localStorage.removeItem(STORAGE_TO_KEY);
    } catch {}
  }, [to]);

  // auto-fill "Откуда" with my location once per session if empty
  const autoLocatedRef = useRef(false);
  useEffect(() => {
    if (autoLocatedRef.current) return;
    if (from || fromText) return;
    if (!navigator.geolocation) return;
    autoLocatedRef.current = true;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let shortName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      let display_name = shortName;
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`, { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
          const d = await resp.json();
          if (d.display_name) { shortName = d.display_name.split(',').slice(0, 2).join(','); display_name = d.display_name; }
        }
      } catch {}
      const place = { lat, lng, name: shortName, shortName, display_name, city: '', country: '', target: 'from' };
      setFrom(place); setFromText(shortName); pushRecent(place);
      toast.success('«Откуда» — ваше местоположение');
    }, () => {}, { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 });
  }, [from, fromText]);

  const fillWithMyLocation = useCallback(async (target) => {
    if (!navigator.geolocation) { toast.error('Геолокация не поддерживается'); return; }
    const toastId = toast.loading('Определяем местоположение…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let shortName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      let display_name = shortName;
      let city = '', country = '';
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`, { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
          const d = await resp.json();
          display_name = d.display_name || shortName;
          if (d.display_name) shortName = d.display_name.split(',').slice(0, 2).join(',');
          city = d.address?.city || d.address?.town || d.address?.village || '';
          country = d.address?.country || '';
        }
      } catch {}
      const place = { lat, lng, name: shortName, shortName, display_name, city, country, target };
      if (target === 'from') { setFrom(place); setFromText(shortName); }
      else if (target === 'to') { setTo(place); setToText(shortName); }
      else if (target && target.startsWith('wp-')) {
        const idx = parseInt(target.split('-')[1], 10);
        if (!isNaN(idx)) {
          setWaypoints(prev => { const a = [...prev]; a[idx] = place; return a; });
          setWaypointTexts(prev => { const a = [...prev]; a[idx] = shortName; return a; });
        }
      } else {
        // fallback: fill empty side
        if (!from) { setFrom(place); setFromText(shortName); }
        else if (!to) { setTo(place); setToText(shortName); }
      }
      pushRecent(place);
      toast.dismiss(toastId);
      toast.success('Местоположение установлено');
    }, (err) => {
      toast.dismiss(toastId);
      if (err.code === 1) toast.error('Разрешите доступ к геолокации в браузере');
      else toast.error('Не удалось получить местоположение');
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  }, []);

  const handleMyLocation = useCallback((target) => {
    // one-click fill instead of map crosshair
    fillWithMyLocation(target || 'from');
  }, [fillWithMyLocation]);

  const handleBuildRoute = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true); setError(null);
    const mode = TRANSPORT_MODES.find(m => m.id === transportMode);
    const validWaypoints = waypoints.filter(Boolean);
    const result = await buildRoute(from, to, mode.osrmProfile, validWaypoints);
    if (result) {
      const enriched = { ...result, mode: transportMode };
      setRouteData(enriched);
      if (onRouteBuilt) onRouteBuilt({ ...enriched, from, to, waypoints: validWaypoints, fromText, toText });
    } else {
      setError(t('routeFinder.noRoutesFound') || 'Маршрут не найден — попробуйте другие точки');
    }
    setLoading(false);
  }, [from, to, waypoints, transportMode, onRouteBuilt, t, fromText, toText]);

  useEffect(() => {
    if (from && to) handleBuildRoute();
  }, [transportMode]); // rebuild on mode change only

  const handleSwap = useCallback(() => {
    setFrom(to); setTo(from);
    setFromText(toText); setToText(fromText);
  }, [from, to, fromText, toText]);

  const addWaypoint = useCallback(() => {
    if (waypoints.length >= 5) { toast.info('Максимум 5 промежуточных точек'); return; }
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
    if (mode === 'driving') return Math.round(km * 1.8 + 8);
    if (mode === 'taxi') return Math.round(km * 5 + 25);
    if (mode === 'bus' || mode === 'minibus') return 5;
    return 0;
  };

  const canBuild = from && to && !loading;
  const activeMode = useMemo(() => TRANSPORT_MODES.find(m => m.id === transportMode), [transportMode]);

  // minimized floating button — outside hidden container
  if (minimized && routeData) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-[88px] right-4 md:absolute md:bottom-auto md:top-[140px] md:right-4 z-[520] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 transition-all"
        title="Развернуть маршрут"
      >
        <Navigation size={22} className="stroke-[2.2]" />
      </button>
    );
  }

  const picking = !!mapPickTarget;
  if (picking) return null; // hide panel while crosshair is active — map must be fully visible
  return (
    <div className="absolute left-2 right-2 md:left-auto md:right-3 z-[520] bg-white dark:bg-slate-900 backdrop-blur-2xl shadow-2xl border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col overflow-hidden bottom-[calc(64px+env(safe-area-inset-bottom,0px)+8px)] max-h-[calc(100dvh-88px-1rem)] md:bottom-auto md:top-[136px] md:max-h-[calc(100dvh-160px)] md:w-[390px]" style={{ maxHeight: 'min(calc(100dvh - 96px), 640px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-br from-blue-600/[0.06] via-indigo-500/[0.04] to-transparent flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Navigation size={14} className="text-white" />
          </span>
          <div>
            <h2 className="text-[13px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">Найти маршрут</h2>
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {routeData ? `${formatDistance(routeData.distance)} · ${formatDuration(routeData.duration)}` : 'Постройте путь пешком, на авто или такси'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {routeData && (
            <button
              onClick={() => setMinimized(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              title="Свернуть"
            >
              <ChevronDown size={16} />
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
        {/* From / To with swap */}
        <div className="relative">
          {/* vertical line */}
          <div className="absolute left-[20px] top-[22px] bottom-[22px] w-0.5 bg-gradient-to-b from-emerald-500 via-slate-300 to-red-500 dark:via-slate-600 rounded-full opacity-60" />
          {/* swap button centered */}
          <button
            onClick={handleSwap}
            className="absolute left-[7px] top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow flex items-center justify-center hover:border-blue-400 hover:text-blue-600 active:scale-90 transition-all"
            title="Поменять местами"
          >
            <ArrowLeftRight size={12} className="text-slate-500 rotate-90" />
          </button>

          <div className="space-y-2.5 pl-0">
            <PlaceField
              value={fromText}
              onChangeText={(v) => { setFromText(v); if (!v) setFrom(null); }}
              onPickPlace={(p) => { setFrom(p); setFromText(p.shortName); pushRecent(p); }}
              placeholder="Откуда — адрес, место или точка на карте"
              icon={MapPin}
              iconColor="#22c55e"
              isActive={mapPickTarget === 'from'}
              onRequestMapPick={() => onRequestMapPick?.('from')}
              autoFocus={!from && !to}
            />
            {/* waypoints */}
            {waypoints.map((wp, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => moveWaypoint(idx, idx - 1)} disabled={idx === 0} className="w-6 h-[14px] rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20">
                    <ChevronUp size={10} className="text-slate-500" />
                  </button>
                  <button onClick={() => moveWaypoint(idx, idx + 1)} disabled={idx === waypoints.length - 1} className="w-6 h-[14px] rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20">
                    <ChevronDown size={10} className="text-slate-500" />
                  </button>
                </div>
                <div className="flex-1">
                  <PlaceField
                    value={waypointTexts[idx] || ''}
                    onChangeText={(v) => {
                      const a = [...waypointTexts]; a[idx] = v;
                      setWaypointTexts(a);
                      if (!v) { const b = [...waypoints]; b[idx] = null; setWaypoints(b); }
                    }}
                    onPickPlace={(p) => {
                      const a = [...waypoints]; a[idx] = p; setWaypoints(a);
                      const b = [...waypointTexts]; b[idx] = p.shortName; setWaypointTexts(b); pushRecent(p);
                    }}
                    placeholder={`Промежуточная ${idx + 1}`}
                    icon={GripVertical}
                    iconColor="#f59e0b"
                    isActive={mapPickTarget === `wp-${idx}`}
                    onRequestMapPick={() => onRequestMapPick?.(`wp-${idx}`)}
                  />
                </div>
                <button onClick={() => removeWaypoint(idx)} className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center text-red-500 hover:bg-red-100">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <PlaceField
              value={toText}
              onChangeText={(v) => { setToText(v); if (!v) setTo(null); }}
              onPickPlace={(p) => { setTo(p); setToText(p.shortName); pushRecent(p); }}
              placeholder="Куда — куда едем?"
              icon={MapPin}
              iconColor="#ef4444"
              isActive={mapPickTarget === 'to'}
              onRequestMapPick={() => onRequestMapPick?.('to')}
            />
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => handleMyLocation('from')} className="inline-flex items-center gap-1.5 px-3 py-1.8 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all">
            <LocateFixed size={12} /> Моё место → Откуда
          </button>
          <button onClick={() => handleMyLocation('to')} className="inline-flex items-center gap-1.5 px-3 py-1.8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50">
            <LocateFixed size={12} /> Моё место → Куда
          </button>
          {waypoints.length < 5 && (
            <button onClick={addWaypoint} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600">
              <Plus size={12} /> Точка
            </button>
          )}
          {(from || to || waypoints.length > 0) && (
            <button onClick={() => { setFrom(null); setTo(null); setFromText(''); setToText(''); setWaypoints([]); setWaypointTexts([]); setRouteData(null); setError(null); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-500">
              <RotateCw size={11} /> Сбросить
            </button>
          )}
        </div>

        {/* Transport modes */}
        <div>
          <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-2 flex items-center gap-1.5"><Route size={11} /> Чем едем</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {TRANSPORT_MODES.map(mode => {
              const active = transportMode === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setTransportMode(mode.id)}
                  className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl border-2 transition-all ${active ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:text-slate-900 dark:border-white shadow-lg' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}`}
                >
                  <Icon size={16} className={active ? '' : 'opacity-80'} />
                  <span className="text-[10px] font-bold mt-1 leading-none">{mode.label}</span>
                  <span className="text-[9px] font-medium opacity-60 leading-none mt-0.5">{mode.id === 'taxi' ? '≈ платно' : mode.id === 'driving' ? 'быстро' : 'эко'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Map pick banner */}
        {mapPickTarget && (
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 animate-pulse">
              <Crosshair size={14} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-amber-900 dark:text-amber-300">Выберите точку на карте</p>
              <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70">Переместите карту под прицел и нажмите ✓</p>
            </div>
            <button onClick={() => onRequestMapPick?.(null)} className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center">
              <X size={12} className="text-slate-500" />
            </button>
          </div>
        )}

        {/* Build button */}
        <button
          onClick={handleBuildRoute}
          disabled={!canBuild}
          className={`w-full py-3.5 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all ${canBuild ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700'}`}
        >
          {loading ? <><Loader2 size={16} className="animate-spin" /> Строим маршрут…</> : <><Search size={16} /> Построить маршрут</>}
        </button>

        {error && (
          <div className="flex gap-3 p-3.5 bg-red-50 dark:bg-red-500/10 rounded-2xl border border-red-200 dark:border-red-500/20">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-red-700 dark:text-red-400">{error}</p>
              <p className="text-[11px] text-red-600/70 dark:text-red-400/70 mt-1">Проверьте точки, уберите лишние промежуточные или смените режим.</p>
            </div>
          </div>
        )}

        {/* Result */}
        {routeData && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black tracking-widest uppercase text-slate-500"><Sparkles size={12} className="text-blue-600" /> Маршрут готов</span>
              <button
                onClick={async () => {
                  const url = `${window.location.origin}${window.location.pathname}#route=${encodeURIComponent(JSON.stringify({ from: { lat: from.lat, lng: from.lng, name: fromText }, to: { lat: to.lat, lng: to.lng, name: toText } }))}`;
                  try { await navigator.clipboard.writeText(url); setCopied(true); toast.success('Ссылка скопирована'); setTimeout(() => setCopied(false), 2000); } catch { toast.info(url); }
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Share2 size={12} />} {copied ? 'Скопировано' : 'Поделиться'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Расстояние', value: formatDistance(routeData.distance), sub: activeMode?.label, icon: Route },
                { label: 'Время', value: formatDuration(routeData.duration), sub: 'без пробок', icon: Clock3 },
                { label: 'Стоимость', value: estimateCost(routeData.distance, routeData.mode) > 0 ? `${estimateCost(routeData.distance, routeData.mode)} TJS` : 'Бесплатно', sub: routeData.mode === 'taxi' ? 'такси' : routeData.mode === 'walking' || routeData.mode === 'cycling' ? '0 сом' : 'топливо', icon: Copy },
              ].map(card => (
                <div key={card.label} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-center">
                  <card.icon size={14} className="mx-auto text-slate-400 mb-1" />
                  <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">{card.label}</p>
                  <p className="text-[13px] font-black text-slate-900 dark:text-white mt-1 leading-none">{card.value}</p>
                  <p className="text-[10px] font-medium text-slate-500 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>

            {/* Route preview A→B */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5">
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                  <span className="w-0.5 flex-1 min-h-[28px] bg-gradient-to-b from-emerald-500 via-slate-300 to-red-500 dark:via-slate-600 rounded-full" />
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20" />
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <p className="text-[10px] font-black tracking-widest uppercase text-emerald-600 dark:text-emerald-400">Откуда</p>
                    <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{fromText || '—'}</p>
                  </div>
                  {waypoints.filter(Boolean).length > 0 && (
                    <p className="text-[11px] font-medium text-slate-500">+ {waypoints.filter(Boolean).length} промеж. {waypoints.filter(Boolean).length === 1 ? 'точка' : 'точки'}</p>
                  )}
                  <div>
                    <p className="text-[10px] font-black tracking-widest uppercase text-red-500">Куда</p>
                    <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{toText || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700 pt-2.5">
                    <Timer size={12} className="text-slate-400" />
                    <span>Выезд {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-slate-300">→</span>
                    <span className="text-emerald-600 dark:text-emerald-400">Прибытие {new Date(Date.now() + (routeData.duration || 0) * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-700 border text-[10px]"><Flag size={10} /> {activeMode?.label}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            {routeData.mode !== 'taxi' ? (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      const navRoute = {
                        ...routeData,
                        from: { lat: from.lat, lng: from.lng, shortName: fromText },
                        to: { lat: to.lat, lng: to.lng, shortName: toText },
                        waypoints: waypoints.filter(Boolean),
                      };
                      onStartNavigation?.(navRoute);
                      onClose?.();
                    }}
                    className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-xl shadow-emerald-500/25 active:scale-[0.98] transition-all p-1"
                  >
                    <span className="flex items-center gap-3 bg-gradient-to-br from-white/0 to-black/0 px-4 py-3">
                      <span className="w-11 h-11 rounded-xl bg-white text-emerald-600 flex items-center justify-center shadow flex-shrink-0">
                        <Play size={20} className="fill-emerald-600 ml-0.5" />
                      </span>
                      <span className="flex-1 text-left">
                        <span className="block text-[15px] font-black leading-none">Поехать</span>
                        <span className="block text-[11px] font-bold opacity-90 mt-0.5">{activeMode?.label} · {formatDuration(routeData.duration)} · {formatDistance(routeData.distance)}</span>
                      </span>
                      <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <ChevronRight size={16} className="text-white" />
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => navCtl.toggleVoice?.()} className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-colors ${navCtl.voiceEnabled ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                      {navCtl.voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />} {navCtl.voiceEnabled ? 'Озвучка вкл' : 'Без звука'}
                    </button>
                    <button onClick={async () => { const url = `${window.location.origin}${window.location.pathname}#route=${encodeURIComponent(JSON.stringify({ from: { lat: from.lat, lng: from.lng, name: fromText }, to: { lat: to.lat, lng: to.lng, name: toText } }))}`; try { await navigator.clipboard.writeText(url); setCopied(true); toast.success('Ссылка скопирована'); setTimeout(()=>setCopied(false),2000);} catch { toast.info(url); } }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
                      {copied ? <Check size={13} className="text-emerald-500" /> : <Share2 size={13} />} Поделиться
                    </button>
                  </div>
                </div>
              ) : (
              <button
                onClick={() => {
                  navigate('/taxi', { state: { trip: { from: { name: fromText, lat: from?.lat, lng: from?.lng }, to: { name: toText, lat: to?.lat, lng: to?.lng } } } });
                  onClose?.();
                }}
                className="w-full py-3.5 rounded-2xl font-black text-sm bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                🚕 Заказать такси — {estimateCost(routeData.distance, 'taxi')} TJS · {formatDuration(routeData.duration)}
              </button>
            )}

            {/* Steps */}
            {routeData.steps?.length > 0 && routeData.mode !== 'taxi' && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-[11px] font-black tracking-widest uppercase text-slate-600 dark:text-slate-300">Пошагово · {routeData.steps.length} шагов</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600">{formatDistance(routeData.distance)}</span>
                </div>
                <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {routeData.steps.slice(0, 30).map((step, i) => {
                    const isFirst = i === 0;
                    const isLast = i === routeData.steps.length - 1;
                    return (
                      <div key={i} className="flex gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 ${isFirst ? 'bg-emerald-500 text-white' : isLast ? 'bg-red-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                            {isFirst ? 'A' : isLast ? 'B' : i}
                          </span>
                          {!isLast && <span className="w-px flex-1 min-h-[12px] bg-slate-200 dark:bg-slate-700" />}
                        </div>
                        <div className="flex-1 min-w-0 py-0.5">
                          <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">
                            {step.name || (step.instruction === 'depart' ? 'Начало движения' : step.instruction === 'arrive' ? 'Вы прибыли' : step.instruction ? step.instruction.replace(/-/g, ' ') : 'Двигайтесь прямо')}
                            {step.modifier && <span className="text-slate-500 font-medium"> · {step.modifier}</span>}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{formatDistance(step.distance)} · {formatDuration(step.duration)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => { setRouteData(null); setError(null); }}
              className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50"
            >
              Построить заново
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
