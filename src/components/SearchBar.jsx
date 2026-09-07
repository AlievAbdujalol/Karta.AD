import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, MapPin, Bus, Route, Clock, Building2, Mic, MicOff, Navigation, Heart, Fuel, ShoppingBag, UtensilsCrossed, Hotel, ParkingCircle, Pill, Landmark as AtmIcon } from 'lucide-react';
import { searchAll, flattenResults, getSearchHistory, addToHistory, clearHistory } from '@/lib/searchUtils';
import { useLanguage } from '@/lib/useLanguage';
import { supabase } from '@/api/supabase';

export default function SearchBar({ cityId, selectedCity, selectedCountry, onSelectResult, mapCenter }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ routes: [], stops: [], vehicles: [], addresses: [], pois: [] });
  const [flat, setFlat] = useState([]);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [favPlaces, setFavPlaces] = useState([]);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const POI_CATS = [
    { q:'остановка', icon: MapPin, label:'Остановки' },
    { q:'парковка', icon: ParkingCircle, label:'Парковки' },
    { q:'АЗС', icon: Fuel, label:'АЗС' },
    { q:'аптека', icon: Pill, label:'Аптеки' },
    { q:'магазин', icon: ShoppingBag, label:'Магазины' },
    { q:'ресторан', icon: UtensilsCrossed, label:'Рестораны' },
    { q:'гостиница', icon: Hotel, label:'Гостиницы' },
    { q:'банкомат', icon: AtmIcon, label:'Банкоматы' },
  ];

  const refreshHistory = useCallback(() => {
    setHistory(getSearchHistory());
  }, []);

  useEffect(() => {
    refreshHistory();
    supabase.auth.getUser().then(({data:{user}})=>{ if(!user) return; supabase.from('saved_places').select('id,name,lat,lng').eq('user_id', user.id).limit(5).then(({data})=>setFavPlaces(data||[])); });
  }, [refreshHistory]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults({ routes: [], stops: [], vehicles: [], addresses: [], pois: [] });
      setFlat([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const res = await searchAll(query, { cityId });
      const pois = [];
      const seenCoords = new Set();

      const addPoi = (p) => {
        const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
        if (!seenCoords.has(key)) { seenCoords.add(key); pois.push(p); }
      };

      // Bias coordinates from selected city (fallback to Tajikistan center)
      const biasLat = selectedCity?.lat || 38.559;
      const biasLng = selectedCity?.lng || 68.773;
      const biasCountry = selectedCountry || selectedCity?.country || '';

      // Country code mapping for Google components parameter
      const countryCodeMap = {
        'Таджикистан': 'tj', 'Tajikistan': 'tj',
        'Узбекистан': 'uz', 'Uzbekistan': 'uz',
        'Кыргызстан': 'kg', 'Kyrgyzstan': 'kg',
        'Казахстан': 'kz', 'Kazakhstan': 'kz',
        'Россия': 'ru', 'Russia': 'ru',
        'Туркменистан': 'tm', 'Turkmenistan': 'tm',
      };
      const googleCountry = countryCodeMap[biasCountry] || 'tj';

      // Nominatim (OpenStreetMap) — biased toward selected city
      try {
        const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
        nomUrl.searchParams.set('format', 'json');
        nomUrl.searchParams.set('q', query);
        nomUrl.searchParams.set('limit', '5');
        nomUrl.searchParams.set('addressdetails', '1');
        nomUrl.searchParams.set('viewbox', `${biasLng - 2},${biasLat + 2},${biasLng + 2},${biasLat - 2}`);
        nomUrl.searchParams.set('bounded', '0');
        const nom = await fetch(nomUrl.toString(), { headers: { 'Accept-Language': 'ru' } });
        const nomData = await nom.json();
        nomData.forEach(n => addPoi({
          _type: 'poi', id: `nom-${n.osm_id}`,
          name: n.display_name.split(',')[0], fullAddress: n.display_name,
          lat: parseFloat(n.lat), lng: parseFloat(n.lon),
          category: n.type, source: 'OpenStreetMap',
        }));
      } catch {}

      // Внешние провайдеры Google/Yandex/Photon отключены на клиенте из-за CORS.
      // Используйте Edge Function proxy (supabase/functions/search-proxy) или оставьте только Nominatim.
      // Nominatim уже отработал выше. Дополнительный Photon — только если доступен, без шума в консоли.
      // try { // Photon disabled to avoid 400 spam — раскомментируйте если прокси настроен
      //   const phUrl = new URL('https://photon.komoot.io/api/');
      //   phUrl.searchParams.set('q', query); phUrl.searchParams.set('limit','5'); phUrl.searchParams.set('lang','ru');
      //   phUrl.searchParams.set('lon', String(biasLng)); phUrl.searchParams.set('lat', String(biasLat));
      //   const ph = await fetch(phUrl.toString()); if(ph.ok){ const phData=await ph.json(); (phData.features||[]).forEach(f=>{ const p=f.properties; const label=[p.name,p.city,p.state,p.country].filter(Boolean).join(', '); addPoi({_type:'poi', id:`ph-${p.osm_id||p.name}-${f.geometry.coordinates[0]}`, name:p.name||label.split(',')[0], fullAddress:label, lat:f.geometry.coordinates[1], lng:f.geometry.coordinates[0], category:p.osm_key||'place', source:'Photon'});});}
      // } catch {}

      res.pois = pois;
      setResults(res);
      setFlat(flattenResults(res));
      setOpen(true);
      setSelectedIdx(-1);
      setLoading(false);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, cityId]);

  const handleSelect = (item) => {
    setQuery('');
    setOpen(false);
    addToHistory(item._type === 'address' ? item.name : item._type === 'route' ? `#${item.number}` : item._type === 'poi' ? item.name : item.name || item.driver_name || '');
    refreshHistory();
    onSelectResult(item);
    inputRef.current?.blur();
  };

  const handleHistorySelect = (h) => {
    setQuery(h);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    const items = showHistory && !query.trim() ? history : flat;
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && items[selectedIdx]) {
        if (showHistory && !query.trim()) {
          handleHistorySelect(items[selectedIdx]);
        } else {
          handleSelect(items[selectedIdx]);
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setShowHistory(false);
      inputRef.current?.blur();
    }
  };

  const focusInput = () => {
    inputRef.current?.focus();
    if (!query.trim() && (history.length || favPlaces.length)) {
      setShowHistory(true);
    }
  };
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR(); rec.lang='ru-RU'; rec.interimResults=false;
    rec.onstart=()=>setListening(true); rec.onend=()=>setListening(false);
    rec.onresult=(e)=>{ const txt=e.results[0][0].transcript; setQuery(txt); setShowHistory(false); };
    rec.start();
  };
  const searchNearby = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos)=>{
      const {latitude, longitude}=pos.coords;
      onSelectResult?.({ _type:'poi', name:'Рядом', lat: latitude, lng: longitude, fullAddress:'Результаты рядом' });
    });
  };

  const typeIcons = {
    route: Route,
    stop: MapPin,
    vehicle: Bus,
    address: MapPin,
    poi: Building2,
  };

  const typeLabels = {
    route: t('search.typeRoute'),
    stop: t('search.typeStop'),
    vehicle: t('search.typeVehicle'),
    address: t('search.typeAddress'),
    poi: t('search.typePoi'),
  };

  const typeColors = {
    route: 'text-blue-600 bg-blue-100',
    stop: 'text-emerald-600 bg-emerald-100',
    vehicle: 'text-purple-600 bg-purple-100',
    address: 'text-amber-600 bg-amber-100',
    poi: 'text-rose-600 bg-rose-100',
  };

  return (
    <div className="relative w-full max-w-lg mx-auto z-[650]" ref={containerRef}>
      <div className="relative flex items-center">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowHistory(false); }}
          onFocus={focusInput}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder') || 'Куда?'}
          className="w-full h-9 sm:h-11 pl-9 pr-20 text-xs sm:text-sm bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/80 rounded-2xl shadow-lg outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button onClick={startVoice} className={`w-7 h-7 rounded-full flex items-center justify-center ${listening?'bg-red-500 text-white animate-pulse':'bg-slate-100 dark:bg-slate-800 text-slate-500'}`} title="Голосовой ввод">{listening?<MicOff size={13}/>:<Mic size={13}/>}</button>
          {query ? (
            <button onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus(); }} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"><X size={13} /></button>
          ) : (
            <button onClick={searchNearby} className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center" title="Рядом"><Navigation size={13}/></button>
          )}
        </div>
      </div>
      {(!query.trim() && (open||showHistory)) && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {POI_CATS.map(c=> <button key={c.q} onClick={()=>setQuery(c.q)} className="shrink-0 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold flex items-center gap-1"><c.icon size={10}/>{c.label}</button>)}
        </div>
      )}

      {(open || showHistory) && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && showHistory && !query.trim() && (
            <div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('search.recentTitle')}</span>
                {history.length > 0 && (
                  <button onClick={() => { clearHistory(); refreshHistory(); }} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium">{t('search.clearHistory')}</button>
                )}
              </div>
              {history.length === 0 && favPlaces.length===0 && (
                <p className="text-xs text-slate-400 text-center py-4">{t('search.historyEmpty')}</p>
              )}
              {favPlaces.length>0 && (
                <div className="px-2 py-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 py-1 flex items-center gap-1"><Heart size={10}/>Избранное</p>
                  {favPlaces.map(p=> <button key={p.id} onClick={()=>onSelectResult?.({_type:'poi', name:p.name, lat:p.lat, lng:p.lng})} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 text-left"><Heart size={12} className="text-rose-500"/><span className="text-xs truncate">{p.name}</span></button>)}
                </div>
              )}
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => handleHistorySelect(h)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${selectedIdx === i ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                >
                  <Clock size={15} className="text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{h}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && open && query.trim() && flat.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">{t('search.noResults')}</p>
          )}

          {!loading && open && query.trim() && flat.length > 0 && (
            <div>
              {flat.map((item, i) => {
                const Icon = typeIcons[item._type] || MapPin;
                const label = typeLabels[item._type] || '';
                const colorCls = typeColors[item._type] || 'text-slate-600 bg-slate-100';
                return (
                  <button
                    key={`${item._type}-${item.id || item.lat}-${i}`}
                    onClick={() => handleSelect(item)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100/50 dark:border-slate-800/30 last:border-0 ${selectedIdx === i ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorCls}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {item._type === 'route' && `#${item.number}`}
                        {item._type === 'route' && item.name ? ` ${item.name}` : ''}
                        {item._type === 'stop' && item.name}
                        {item._type === 'vehicle' && (item.driver_name || `№${item.vehicle_number}`)}
                        {item._type === 'address' && item.name}
                        {item._type === 'poi' && item.name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {item._type === 'stop' && t('search.stopLabel')}
                        {item._type === 'vehicle' && `${item.route_number ? `#${item.route_number} · ` : ''}${item.vehicle_number || ''}`}
                        {item._type === 'address' && (item.fullAddress || '')}
                        {item._type === 'route' && `${item.type === 'bus' ? t('search.busLabel') : t('search.minibusLabel')} · ${item.city_name || ''}`}
                        {item._type === 'poi' && (item.source ? `${item.source} · ` : '') + (item.fullAddress || '')}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${colorCls}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
