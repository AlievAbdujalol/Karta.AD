import { useState, useCallback, useRef, useEffect } from 'react';
import { MapPin, Loader2, Crosshair, ArrowLeftRight, Navigation, History, Clock, Star } from 'lucide-react';
import { toast } from 'sonner';
import { buildOsrmRoute } from '@/lib/osrmClient';

const HISTORY_KEY = 'karta_route_history';
const FAVORITES_KEY = 'karta_route_favorites';
const MAX_HISTORY = 5;

// Helper: Nominatim Geocoding
async function searchAddress(query, limit = 5) {
  if (!query || query.length < 2) return [];
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&accept-language=ru&addressdetails=1'
      + '&q=' + encodeURIComponent(query) + '&limit=' + limit;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'KartaAD/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.map((item) => ({
      id: item.place_id,
      name: item.display_name,
      shortName: item.display_name.split(',').slice(0, 3).join(', '),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
    }));
  } catch {
    return [];
  }
}

function PlaceField({ value, onChangeText, onPickPlace, placeholder, iconColor, isActive, onRequestMapPick }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const timerRef = useRef(null);

  const handleChange = useCallback((val) => {
    onChangeText(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 2) { setSuggestions([]); return; }
    setLoadingSug(true);
    timerRef.current = setTimeout(async () => {
      const res = await searchAddress(val);
      setSuggestions(res);
      setLoadingSug(false);
    }, 350);
  }, [onChangeText]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="relative">
      <div className={`flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border-2 bg-white dark:bg-slate-800 transition-all ${isActive ? 'border-amber-400' : 'border-slate-200'}`}>
        <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: iconColor + '18', color: iconColor }}>
          <MapPin size={15} />
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-[13px] font-semibold text-slate-900 dark:text-white"
        />
        {loadingSug && <Loader2 size={14} className="animate-spin text-slate-400" />}
        <button onClick={onRequestMapPick} className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-700">
          <Crosshair size={12} />
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border rounded-2xl shadow-xl z-50">
          {suggestions.map((s) => (
            <button key={s.id} onClick={() => { onPickPlace(s); setSuggestions([]); }} className="w-full px-4 py-2 text-left text-xs hover:bg-slate-50">{s.shortName}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RouteSearchComponent({ onRouteRequested }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [history, setHistory] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [eta, setEta] = useState(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
      const storedFavs = localStorage.getItem(FAVORITES_KEY);
      if (storedFavs) setFavorites(JSON.parse(storedFavs));
    } catch {}
  }, []);

  const toggleFavorite = (route) => {
    const isFav = favorites.some(f => f.from.name === route.from.name && f.to.name === route.to.name);
    let newFavs;
    if (isFav) {
      newFavs = favorites.filter(f => f.from.name !== route.from.name || f.to.name !== route.to.name);
    } else {
      newFavs = [...favorites, route];
    }
    setFavorites(newFavs);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavs));
  };

  useEffect(() => {
    if (from && to) {
      setCalculating(true);
      buildOsrmRoute(from, to, 'driving').then(res => {
        if (res) {
          setEta(Math.round(res.duration / 60));
        } else {
          setEta(null);
        }
        setCalculating(false);
      });
    } else {
      setEta(null);
    }
  }, [from, to]);

  const saveToHistory = (route) => {
    const newHistory = [route, ...history.filter(h => h.from.name !== route.from.name || h.to.name !== route.to.name)].slice(0, MAX_HISTORY);
    setHistory(newHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  };

  const handleSearch = () => {
    if (from && to) {
      saveToHistory({ from, to });
      onRouteRequested({ from, to });
    } else {
      toast.error("Пожалуйста, выберите начальную и конечную точки.");
    }
  };

  const loadFromHistory = (route) => {
    setFrom(route.from);
    setTo(route.to);
    setFromText(route.from.shortName);
    setToText(route.to.shortName);
  };

  return (
    <div className="p-4 space-y-4 bg-white dark:bg-slate-900 rounded-3xl shadow-lg">
      <h2 className="text-lg font-bold">Поиск маршрута</h2>
      <PlaceField value={fromText} onChangeText={setFromText} onPickPlace={setFrom} placeholder="Откуда" iconColor="#22c55e" />
      <div className="flex justify-center">
        <ArrowLeftRight size={20} className="text-slate-400 rotate-90" />
      </div>
      <PlaceField value={toText} onChangeText={setToText} onPickPlace={setTo} placeholder="Куда" iconColor="#ef4444" />
      
      {eta !== null && (
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-bold bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl">
          <Clock size={16} /> Приблизительное время: {eta} мин
        </div>
      )}

      <button onClick={handleSearch} disabled={calculating} className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
        {calculating ? <Loader2 className="animate-spin" /> : <Navigation size={18} />} Найти маршрут
      </button>

      <div className="flex gap-2 pt-2">
        {from && to && (
          <button onClick={() => toggleFavorite({ from, to })} className="flex-1 py-2 text-xs font-bold text-amber-600 bg-amber-50 rounded-xl flex items-center justify-center gap-1">
            <Star size={14} className={favorites.some(f => f.from.name === from.name && f.to.name === to.name) ? "fill-amber-500" : ""} /> 
            {favorites.some(f => f.from.name === from.name && f.to.name === to.name) ? "В избранном" : "В избранное"}
          </button>
        )}
      </div>
      
      {favorites.length > 0 && (
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5"><Star size={14}/> Избранное</h3>
          <div className="space-y-1">
            {favorites.map((h, i) => (
              <button key={i} onClick={() => loadFromHistory(h)} className="w-full text-left text-[11px] p-2 hover:bg-slate-50 rounded-lg truncate text-slate-700 dark:text-slate-300">
                {h.from.shortName} → {h.to.shortName}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {history.length > 0 && (
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5"><History size={14}/> История</h3>
          <div className="space-y-1">
            {history.map((h, i) => (
              <button key={i} onClick={() => loadFromHistory(h)} className="w-full text-left text-[11px] p-2 hover:bg-slate-50 rounded-lg truncate text-slate-600 dark:text-slate-400">
                {h.from.shortName} → {h.to.shortName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
