import { useState, useEffect, useCallback, useRef } from 'react';
import { City, FavoriteRoute, TripLog } from '@/api/entities';
import { supabase } from '@/api/supabase';
import { useLanguage, LANG_KEY } from '@/lib/useLanguage';
import { getCachedLastLocation, saveLastLocation, MY_LOCATION_EVENT } from '@/lib/locationCache';
import { fetchOsmTransitRoutes, bboxAround, mergeTransitRoutes } from '@/lib/osmTransit';
import { toast } from 'sonner';
import BusMap from '@/components/BusMap';
import StopWatcher from '@/components/StopWatcher';
import { useStopNotifier } from '@/hooks/useStopNotifier';
import { useLocationSharing } from '@/hooks/useLocationSharing';
import { useGroupRoute } from '@/hooks/useGroupRoute';
import SchedulePanel from '@/components/SchedulePanel';
import GroupRoutePanel from '@/components/GroupRoutePanel';
import HomeHeader from '@/components/HomeHeader';
import SearchResultCard from '@/components/SearchResultCard';
import NavigationHUD from '@/components/NavigationHUD';
import NavigationBottomBar from '@/components/NavigationBottomBar';
import TripSummary from '@/components/TripSummary';
import { useNavigation } from '@/lib/NavigationContext';
import { WifiOff } from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import ErrorBoundary, { BusMapErrorFallback } from '@/components/ErrorBoundary';
import { useNotificationCount } from '@/lib/NotificationContext';
import { useLocation } from 'react-router-dom';
import BottomSheet from '@/components/BottomSheet';
import PlaceCard from '@/components/PlaceCard';
import ShareRouteSheet from '@/components/ShareRouteSheet';
import MapEventsSheet from '@/components/MapEventsSheet';
import BluetoothSheet from '@/components/BluetoothSheet';
import MiniMap from '@/components/MiniMap';
import AiChat from '@/components/AiChat';
import AlertBanner from '@/components/AlertBanner';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { smartSearch, pickDeepLinkResult } from '@/lib/searchUtils';

/** Рисует позицию из кэша синей точкой: маркер мог смонтироваться раньше,
 *  чем кэш появился, — шлём событие, которое UserLocationMarker слушает. */
function broadcastLocation(c) {
  try {
    window.dispatchEvent(new CustomEvent(MY_LOCATION_EVENT, {
      detail: { lat: c.lat, lng: c.lng, accuracy: c.accuracy },
    }));
  } catch { /* нет window — не критично */ }
}

export default function Home() {
  const { t, lang, setLang } = useLanguage();
  const { user: currentUser } = useCurrentUser();
  const { contactLocations, shareWith, unshareWith } = useLocationSharing(currentUser?.id);
  const { groupRoute, members, onlineMembers, sharingEnabled: groupSharingEnabled, createGroup, leaveGroup, finishGroup, toggleSharing: toggleGroupSharing, myPosition, meetPoint } = useGroupRoute(currentUser?.id);
  const nav = useNavigation();
  const [cities, setCities] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(() => localStorage.getItem('karta_country') || '');
  const [selectedCity, setSelectedCity] = useState(() => {
    try { const saved = localStorage.getItem('karta_city'); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [selectedType, setSelectedType] = useState('all');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [watchedStop, setWatchedStop] = useState(null);
  const { notifications, clear: clearNotifications, addLocalNotification } = useNotificationCount();
  const [favorites, setFavorites] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [flyTo, setFlyTo] = useState(null);

  const location = useLocation();
  const [sheetState, setSheetState] = useState('collapsed');
  const [activeTab, setActiveTab] = useState('stops');
  const [routingOpen, setRoutingOpen] = useState(false);
  const [placeCard, setPlaceCard] = useState(null);
  const [shareTipHidden, setShareTipHidden] = useState(() => {
    try { return localStorage.getItem('karta_sharetip_dismissed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    const h = () => setShareTipHidden(true);
    window.addEventListener('karta_sharetip', h);
    const fly = (e) => {
      if (e?.detail?.lat != null && e?.detail?.lng != null) {
        setFlyTo({ lat: e.detail.lat, lng: e.detail.lng, zoom: e.detail.zoom || 16 });
      }
    };
    window.addEventListener('karta_ai_flyto', fly);
    return () => {
      window.removeEventListener('karta_sharetip', h);
      window.removeEventListener('karta_ai_flyto', fly);
    };
  }, []);
  const [shareSheet, setShareSheet] = useState(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [tiltEnabled, setTiltEnabled] = useState(()=> { try{return localStorage.getItem('karta_tilt')==='1';}catch{return false;}});
  const [autoCenter, setAutoCenter] = useState(true);
  const [routeMeta, setRouteMeta] = useState(null);
  const [liveCenter, setLiveCenter] = useState(null);
  const [eventPos, setEventPos] = useState(null);
  const [eventLine, setEventLine] = useState([]);
  const [roadDir, setRoadDir] = useState(0);
  const [eventType, setEventType] = useState('closure');
  
  useKeyboardShortcuts({
    onEscape: () => {
      if (routingOpen) {
        setRoutingOpen(false);
      } else if (sheetState !== 'collapsed') {
        setSheetState('collapsed');
      } else if (eventsOpen) {
        setEventsOpen(false);
        setEventPos(null);
        setEventLine([]);
      } else if (placeCard) {
        setPlaceCard(null);
      }
    }
  });

  useEffect(()=>{ const h=(e)=>setTiltEnabled(!!e.detail); window.addEventListener('karta_tilt_change', h); return ()=>window.removeEventListener('karta_tilt_change', h); },[]);
  useEffect(()=>{ const h=(e)=>setAutoCenter(!!e.detail); window.addEventListener('karta_autocenter', h); return ()=>window.removeEventListener('karta_autocenter', h); },[]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'transport') {
      setActiveTab('routes');
      setSheetState('half');
    }
  }, [location.search]);

  useEffect(() => {
    if (selectedRoute) setRoutingOpen(false);
  }, [selectedRoute?.id]);

  const autoDetectCity = useCallback((citiesList) => {
    if (!citiesList?.length) return;
    if (localStorage.getItem('karta_city')) return;

    const detectFrom = (latitude, longitude) => {
      let nearest = null;
      let minDist = Infinity;
      citiesList.forEach(city => {
        if (!city.lat || !city.lng) return;
        const d = Math.hypot(city.lat - latitude, city.lng - longitude);
        if (d < minDist) { minDist = d; nearest = city; }
      });
      if (nearest && minDist < 2) {
        setSelectedCity(nearest);
        setSelectedCountry(nearest.country || '');
      }
      setLocating(false);
    };

    // Свежий кэш позиции — город определяем сразу, без запроса GPS
    const cached = getCachedLastLocation();
    if (cached) { detectFrom(cached.lat, cached.lng); return; }

    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        saveLastLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        detectFrom(pos.coords.latitude, pos.coords.longitude);
      },
      () => setLocating(false),
      { timeout: 6000, maximumAge: 600000 }
    );
  }, []);

  useEffect(() => {
    if (currentUser?.id) {
      FavoriteRoute.filter({ user_id: currentUser.id })
        .then(f => setFavorites(f.map(x => x.route_id)))
        .catch(() => {});
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.language && !localStorage.getItem(LANG_KEY)) {
      setLang(currentUser.language);
    }
  }, [currentUser?.id]);

  const toggleFavorite = async (route) => {
    if (!currentUser) return;
    try {
      const isFav = favorites.includes(route.id);
      if (isFav) {
        const existing = await FavoriteRoute.filter({ user_id: currentUser.id, route_id: route.id });
        if (existing[0]) {
          const { error } = await supabase.from('favorite_routes').delete().eq('id', existing[0].id);
          if (error) throw new Error(error.message);
        }
        setFavorites(f => f.filter(id => id !== route.id));
      } else {
        const city = cities.find(c => c.id === route.city_id);
        const { error } = await supabase.from('favorite_routes').insert({
          user_id: currentUser.id, route_id: route.id,
          route_number: route.number, route_name: route.name,
          route_type: route.type, route_color: route.color,
          city_name: city?.name || '',
        });
        if (error) throw new Error(error.message);
        setFavorites(f => [...f, route.id]);
      }
    } catch (err) {
      toast.error(err.message || 'Ошибка избранного');
    }
  };

  const logTrip = async (route) => {
    if (!currentUser || !route) return;
    const city = cities.find(c => c.id === route.city_id);
    await TripLog.create({
      user_id: currentUser.id, route_id: route.id,
      route_number: route.number, route_name: route.name,
      route_type: route.type, route_color: route.color,
      city_name: city?.name || '',
    });
  };

  const [panelVisible, setPanelVisible] = useState(false);

  const handleShareTrip = useCallback(() => {
    setPanelVisible(v => !v);
  }, []);

  // Открыть RoutingPanel с заданной точкой назначения (из GroupRoutePanel)
  const handleNavigateTo = useCallback((place) => {
    setPanelVisible(false);
    // Сохраняем целевую точку в localStorage — RoutingPanel подхватит при открытии
    try {
      localStorage.setItem('karta_route_to', JSON.stringify({
        lat: place.lat, lng: place.lng,
        name: place.name || 'Точка', shortName: place.name || 'Точка',
      }));
    } catch {}
    setSheetState('collapsed');
    toast.info(`Откройте «Найти маршрут» — цель уже установлена: ${place.name || 'Точка'}`, { duration: 4000 });
  }, []);

  const handleSelectResult = useCallback((item) => {
    setSearchResult(item);
    setPlaceCard(item);
    setFlyTo({ lat: item.lat, lng: item.lng, zoom: 16 });

    if (item._type === 'route') {
      const route = routes.find(r => r.id === item.id);
      if (route) {
        setSelectedRoute(route);
        setActiveTab('routes');
      }
    } else if (item._type === 'stop') {
      setWatchedStop(item);
    }
    // history
    try { if(currentUser?.id) supabase.from('route_history').insert({ user_id: currentUser.id, start_lat: item.lat, start_lng: item.lng, transport_mode: 'driving', polyline: item }).then(()=>{}); } catch{}
  }, [routes, currentUser?.id]);

  useStopNotifier({
    vehicles,
    watchedStop,
    route: selectedRoute,
    onNotification: (n) => addLocalNotification(n),
  });

  useEffect(() => {
    City.list().then(data => {
      setCities(data);
      const unique = [...new Set(data.map(c => c.country).filter(Boolean))];
      setCountries(unique);
      setIsOffline(false);
      autoDetectCity(data);
    }).catch(() => {
      setIsOffline(true);
    });
  }, [autoDetectCity]);

  useEffect(() => {
    localStorage.setItem('karta_country', selectedCountry);
    if (selectedCity) {
      localStorage.setItem('karta_city', JSON.stringify(selectedCity));
    } else {
      localStorage.removeItem('karta_city');
    }
  }, [selectedCountry, selectedCity]);

  const filteredCities = selectedCountry ? cities.filter(c => c.country === selectedCountry) : cities;

  // Сохранённый город мог устареть (город пересоздан в БД → новый uuid) или разойтись
  // со страной: тогда селекты показывают пусто, хотя город выбран и маршруты загружены —
  // на проде выглядело как «город не выбран» (UX-фидбек). Сверяем выбор со списком.
  useEffect(() => {
    if (!cities.length) return;
    setSelectedCity(prev => {
      if (!prev) return prev;
      const byId = cities.find(c => c.id === prev.id);
      if (byId) {
        const same = (byId.name || '').trim() === (prev.name || '').trim() && (byId.country || '') === (prev.country || '');
        return same ? prev : byId;
      }
      // id больше нет в БД — ищем по имени (без учёта хвостовых пробелов, в данных они есть)
      return cities.find(c => (c.name || '').trim() === (prev.name || '').trim()) || null;
    });
  }, [cities]);

  // страна в фильтре должна совпадать со страной выбранного города — иначе город
  // «выпадает» из списка (filteredCities) и селект выглядит пустым
  useEffect(() => {
    if (selectedCity?.country && selectedCountry && selectedCity.country !== selectedCountry) {
      setSelectedCountry(selectedCity.country);
    }
  }, [selectedCity, selectedCountry]);

  // При реальной смене города сбрасываем выбранный маршрут и наблюдаемую остановку:
  // иначе точки старого города «залипают» на карте нового (UX-фидбек: «если выбран
  // другой город — показать остановки другого города»).
  const prevCityIdRef = useRef(selectedCity?.id || null);
  useEffect(() => {
    const id = selectedCity?.id || null;
    if (prevCityIdRef.current === id) return;
    prevCityIdRef.current = id;
    setSelectedRoute(null);
    setWatchedStop(null);
  }, [selectedCity]);

  useEffect(() => {
    if (selectedCity) {
      supabase.from('routes').select('*')
        .or(`city_id.is.null,city_id.eq.${selectedCity.id}`)
        .order('created_at', { ascending: false })
        .then(async ({ data }) => {
          let list = data || [];
          // Линии OSM пополняют список города (в БД часто нет данных)
          try {
            if (selectedCity.lat && selectedCity.lng && navigator.onLine !== false) {
              const osm = await fetchOsmTransitRoutes(bboxAround([selectedCity], 0.25));
              list = mergeTransitRoutes(list, osm);
            }
          } catch { /* OSM недоступен — только маршруты БД */ }
          setRoutes(list);
          setIsOffline(false);
        }).catch(() => {
          setIsOffline(true);
        });
    } else {
      setRoutes([]);
      setSelectedRoute(null);
    }
  }, [selectedCity]);

  const filteredRoutes = selectedType === 'all' ? routes : routes.filter(r => r.type === selectedType);

  // стабильный ключ вместо массива routes — иначе каждый setRoutes перезапускал опрос и плодил дубли запросов
  const routesKey = routes.map(r => r.id).join(',');

  useEffect(() => {
    let interval;
    let retryDelay = 5000;

    const fetchVehicles = async () => {
      if (!selectedCity) { setVehicles([]); return; }
      // нет сети — даже не стучимся, иначе висячие таймауты и спам в консоли
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { setIsOffline(true); return; }
      try {
        let q = supabase.from('vehicles').select('*').eq('is_active', true);
        if (selectedRoute) q = q.eq('route_id', selectedRoute.id);
        const { data, error } = await q;
        if (error) throw error;
        const all = data || [];
        const result = selectedRoute ? all : all.filter(v => new Set(routes.map(r => r.id)).has(v.route_id));
        setVehicles(result);
        setIsOffline(false);
        retryDelay = 5000;
      } catch {
        setIsOffline(true);
        clearInterval(interval);
        retryDelay = Math.min(retryDelay * 1.5, 30000);
        interval = setInterval(fetchVehicles, retryDelay);
      }
    };
    fetchVehicles();
    interval = setInterval(fetchVehicles, 5000);
    // сеть вернулась — сразу пробуем, не ждём тик
    const goOnline = () => fetchVehicles();
    window.addEventListener('online', goOnline);
    return () => { clearInterval(interval); window.removeEventListener('online', goOnline); };
  }, [selectedCity, selectedRoute, routesKey]);

  const mapCenter = selectedCity?.lat && selectedCity?.lng
    ? [selectedCity.lat, selectedCity.lng]
    : [38.559, 68.773];

  // Глубокая ссылка с сайта бизнеса (секция «Как нас найти»): /?q=адрес —
  // сразу показать место на карте. Контекст поиска обновляем в ref на каждом
  // рендере, чтобы сам поиск не перезапускался при сдвиге центра карты.
  const deeplinkRef = useRef({ cityId: null, mapCenter: null, onSelect: null });
  useEffect(() => {
    deeplinkRef.current = { cityId: selectedCity?.id || null, mapCenter, onSelect: handleSelectResult };
  });
  useEffect(() => {
    const q = (new URLSearchParams(location.search).get('q') || '').trim();
    if (!q) return undefined;
    let cancelled = false;
    const { cityId, mapCenter: center } = deeplinkRef.current;
    smartSearch(q, { cityId, mapCenter: center })
      .then((res) => {
        if (cancelled) return;
        const item = pickDeepLinkResult(res);
        if (item) deeplinkRef.current.onSelect?.(item);
        else toast.info('Адрес не найден на карте');
      })
      .catch(() => { if (!cancelled) toast.info('Адрес не найден на карте'); });
    return () => { cancelled = true; };
  }, [location.search]);

  const handleLocateUser = useCallback(() => {
    if (!navigator.geolocation) { toast.error('Геолокация не поддерживается'); return; }
    // 1) Мгновенно по кэшу — пользователь сразу видит себя на карте,
    //    свежий GPS ниже уточнит центр (если пришлёт другие координаты).
    const cached = getCachedLastLocation(15 * 60 * 1000);
    if (cached) { setFlyTo({ lat: cached.lat, lng: cached.lng, zoom: 16 }); broadcastLocation(cached); }
    toast.loading('Ищем вас на карте…', { id: 'locate-home' });

    const onPosition = (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      toast.dismiss('locate-home');
      // saveLastLocation шлёт karta_my_location — синяя точка рисуется сразу,
      // не дожидаясь первого кадра watchPosition
      saveLastLocation({ lat: latitude, lng: longitude, accuracy });
      setFlyTo({ lat: latitude, lng: longitude, zoom: 16 });
      // найти ближайший маршрут по остановкам
      let bestRoute = null; let bestDist = Infinity;
      routes.forEach(r => {
        (r.stops || []).forEach(s => {
          if (!s.lat || !s.lng) return;
          const d = Math.hypot(s.lat - latitude, s.lng - longitude) * 111320;
          if (d < bestDist) { bestDist = d; bestRoute = r; }
        });
      });
      if (bestRoute && bestDist < 3000) {
        setSelectedRoute(bestRoute);
        toast.success(`Вы рядом с маршрутом #${bestRoute.number} — ${Math.round(bestDist)} м`, { duration: 3500 });
      } else {
        toast.success('Вы на карте — синяя точка', { duration: 2500 });
      }
      setActiveTab('stops');
      setSheetState('half');
    };

    const onError = (err) => {
      toast.dismiss('locate-home');
      if (err?.code === 1) toast.error('Разрешите доступ к геолокации: иконка слева от адреса сайта');
      else if (cached) toast.warning('GPS не отвечает — показываем последнее известное место');
      else toast.error('Не удалось определить местоположение');
    };

    // 2) Быстрый фикс (сеть/кэш браузера) — отвечает даже без GPS-чипа на
    //    десктопе; если точность кошмарная (>800 м) — повтор с точным GPS.
    navigator.geolocation.getCurrentPosition((pos) => {
      if ((pos.coords.accuracy ?? 0) > 800) {
        navigator.geolocation.getCurrentPosition(
          onPosition,
          (err) => (err?.code === 1 ? onError(err) : onPosition(pos)),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
      } else {
        onPosition(pos);
      }
    }, onError, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  }, [routes]);

  // «Авто-центр»: при включении сразу показываем пользователя на карте —
  // иначе кнопка вне навигации визуально «ничего не делает».
  const autoCenterPrevRef = useRef(autoCenter);
  useEffect(() => {
    if (autoCenter === autoCenterPrevRef.current) return;
    autoCenterPrevRef.current = autoCenter;
    if (!autoCenter) return;
    const cached = getCachedLastLocation(15 * 60 * 1000);
    if (cached) { setFlyTo({ lat: cached.lat, lng: cached.lng, zoom: 16 }); broadcastLocation(cached); }
    else handleLocateUser(); // нет кэша — запрашиваем геолокацию, как кнопка «местоположение»
  }, [autoCenter, handleLocateUser]);

  return (
    <div className="relative w-full h-full bg-slate-50 dark:bg-slate-950 overflow-hidden select-none">
      <AlertBanner />
      <div className="absolute inset-0 w-full h-full z-0">
        <ErrorBoundary fallback={(error) => <BusMapErrorFallback error={error} />}>
          <BusMap vehicles={vehicles} route={selectedRoute} center={mapCenter} watchedStop={watchedStop} flyTo={flyTo} onFlyDone={() => setFlyTo(null)} routes={routes} onRoutingOpen={() => setSheetState('collapsed')} onRoutingStateChange={(open, meta)=>{setRoutingOpen(open); if(meta) setRouteMeta(meta);}} contactLocations={contactLocations} groupRouteMembers={onlineMembers} onShareTrip={handleShareTrip} groupRoute={groupRoute} panelVisible={panelVisible} onLocate={handleLocateUser} tiltEnabled={tiltEnabled} autoCenter={autoCenter} routeMeta={routeMeta} onPlaceSelect={setPlaceCard} onCenterChange={setLiveCenter} hideEvents={eventsOpen} onMapClick={eventsOpen ? (latlng)=> {
            if(eventType==='roadwork'){
              setEventLine(prev=>{
                const next=[...prev, [latlng.lat, latlng.lng]];
                // cycle dir each tap: 1 point ❌, 2 points ⬆️, 3+ ⬇️
                setRoadDir(next.length===1?0 : next.length===2?1 : 2);
                try{ navigator.vibrate?.(30);}catch{}
                return next;
              });
            } else setEventPos([latlng.lat, latlng.lng]);
          } : undefined} eventPos={eventPos} eventLine={eventLine} roadDir={roadDir} />
        </ErrorBoundary>
        {eventsOpen && !eventPos && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10" style={{bottom:'42vh'}}>
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-[#e10600] border-2 border-white shadow-lg flex items-center justify-center text-white font-black">—</div>
              <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-[#e10600] rotate-45 -translate-x-1/2 border-r border-b border-white" />
            </div>
            <div className="absolute flex items-center justify-center -translate-y-10">
              <span className="bg-white/90 dark:bg-slate-900/90 px-2 py-1 rounded-full text-[11px] font-bold shadow border">Тапните по карте — выберите место, затем тип</span>
            </div>
          </div>
        )}
        {eventPos && (
          <div className="absolute inset-0 pointer-events-none z-10" style={{bottom:'42vh'}}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-600 text-white px-3 py-1 rounded-full text-[11px] font-bold shadow">✓ Место выбрано</div>
          </div>
        )}
      </div>

      {/* Navigation overlays — rendered above z-0 map container */}
      {nav.isActive && <NavigationHUD />}
      {nav.isActive && <NavigationBottomBar />}
      <TripSummary />

      {/* в навигации шапку прячем — иначе налезает на манёвр слева и скорость справа */}
      {!nav.isActive && (
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[600] pointer-events-auto pt-3">
        <HomeHeader
          lang={lang} setLang={setLang}
          countries={countries}
          selectedCountry={selectedCountry} setSelectedCountry={setSelectedCountry}
          cities={cities} filteredCities={filteredCities}
          selectedCity={selectedCity} setSelectedCity={(city) => { setSelectedCity(city); setSelectedRoute(null); }}
          selectedType={selectedType} setSelectedType={setSelectedType}
          routes={routes} filteredRoutes={filteredRoutes}
          selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute}
          favorites={favorites} toggleFavorite={toggleFavorite}
          logTrip={logTrip}
          notifications={notifications}
          onClearNotifications={clearNotifications}
          onSelectResult={handleSelectResult}
          mapCenter={mapCenter}
        />
      </div>
      )}

      {isOffline && (
        <div className="absolute top-36 left-1/2 -translate-x-1/2 z-[700] bg-amber-500/95 backdrop-blur-md text-white text-[10px] font-extrabold px-3 py-1.5 rounded-2xl flex items-center justify-center gap-1.5 shadow-lg pointer-events-auto animate-pulse">
          <WifiOff size={12} />
          {t('home.offlineMode')}
        </div>
      )}

      {searchResult && (
        <SearchResultCard result={searchResult} onClose={() => setSearchResult(null)} />
      )}
      {placeCard && <PlaceCard place={placeCard} onClose={()=>setPlaceCard(null)} onRoute={(p)=>{setPlaceCard(null); setRouteMeta({to:p});}} onFlyTo={(p)=>setFlyTo({lat:p.lat,lng:p.lng,zoom:16})} userPos={nav.userPosition}/>}
      {shareSheet && <ShareRouteSheet from={shareSheet.from} to={shareSheet.to} route={shareSheet.route} onClose={()=>setShareSheet(null)}/>}
      {eventsOpen && <MapEventsSheet center={eventPos || (eventLine[0] ? eventLine[0] : null) || liveCenter || mapCenter} eventLine={eventLine} roadDir={roadDir} onDirChange={setRoadDir} onClearLine={()=> setEventLine([])} onTypeChange={setEventType} onClose={()=>{setEventsOpen(false); setEventPos(null); setEventLine([]);}} onPickHint={eventPos || eventLine.length ? null : 'Тапните по карте, чтобы выбрать место'}/>}
      <BluetoothSheet onClose={()=>{}}/>
      {nav.isActive && (nav.userSpeed || 0) < 1 && <div className="absolute bottom-[232px] left-2 z-[550] opacity-90 hover:opacity-100 transition-opacity pointer-events-none"><MiniMap center={nav.userPosition||mapCenter} route={nav.routeData} userPos={nav.userPosition} heading={nav.userHeading}/></div>}
      {nav.isActive && !shareTipHidden && (
        <div className="absolute top-[150px] left-2 z-[550] pointer-events-auto">
          <div className="bg-slate-900/90 backdrop-blur text-white rounded-xl pl-3 pr-1.5 py-1.5 flex items-center gap-2 shadow-lg border border-white/10 max-w-[250px]">
            <span className="text-[11px] leading-tight flex-1">Отправляйте друзьям свою геопозицию в реальном времени</span>
            <button onClick={()=>{ try{navigator.share?.({title:'Геопозиция', url: window.location.href});}catch{} }} className="text-emerald-400 text-[11px] font-bold whitespace-nowrap">Делиться</button>
            <button
              onClick={() => { try { localStorage.setItem('karta_sharetip_dismissed', '1'); } catch {} window.dispatchEvent(new Event('karta_sharetip')); }}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center flex-shrink-0 text-[13px] leading-none"
              title="Скрыть"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <button onClick={()=>{ try{ navigator.vibrate?.(50); }catch{} if(!eventsOpen){ setTimeout(()=> setEventsOpen(true), 70); setEventPos(null); } else setEventsOpen(false); }} className={`absolute left-2 ${nav.isActive ? 'bottom-[190px]' : 'bottom-[160px]'} z-[500] w-9 h-9 rounded-2xl bg-white dark:bg-slate-900 border shadow flex items-center justify-center text-[10px] font-black`}>{eventsOpen?'×':'!'}</button>
      <AiChat
        cityName={selectedCity?.name || selectedCity?.country || ''}
        mapContext={{ center: liveCenter || mapCenter, userPos: nav.userPosition, routesCount: routes.length }}
        navMode={nav.isActive}
      />

      {/* Group Route Panel */}
      {panelVisible && (
        <GroupRoutePanel
          groupRoute={groupRoute}
          members={members}
          onlineMembers={onlineMembers}
          sharingEnabled={groupSharingEnabled}
          myPosition={myPosition}
          meetPoint={meetPoint}
          onLeave={leaveGroup}
          onFinish={finishGroup}
          onToggleSharing={toggleGroupSharing}
          contactLocations={contactLocations}
          onShareWith={shareWith}
          onUnshareWith={unshareWith}
          onClose={() => setPanelVisible(false)}
          onNavigateTo={handleNavigateTo}
          onFlyTo={(p) => setFlyTo({ lat: p.lat, lng: p.lng, zoom: 16 })}
          userId={currentUser?.id}
          onCreateGroup={createGroup}
          selectedRoute={selectedRoute}
        />
      )}

      {!nav.isActive && <BottomSheet
        selectedCity={selectedCity}
        routes={routes}
        vehicles={vehicles}
        favorites={favorites}
        toggleFavorite={toggleFavorite}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        mapCenter={mapCenter}
        currentUser={currentUser}
        watchedStop={watchedStop}
        setWatchedStop={setWatchedStop}
        sheetState={sheetState}
        setSheetState={setSheetState}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onFlyTo={(p) => setFlyTo(p)}
        userPosition={nav.userPosition}
        onSelectFavDriver={async (driverId) => {
          const { data } = await supabase.from('vehicles').select('*').eq('driver_id', driverId).eq('is_active', true).maybeSingle();
          if (data) {
            if (data.route_id) {
              const route = routes.find(r => r.id === data.route_id);
              if (route) setSelectedRoute(route);
            }
            setActiveTab('routes');
            setFlyTo({ lat: data.lat, lng: data.lng, zoom: 16 });
          }
        }}
      />}
      {!nav.isActive && <SchedulePanel route={selectedRoute} hidden={routingOpen} />}

      {/* Подсказка «Выберите город»: на десктопе раньше сидела под шапкой (md:top-3 при
          z-[200] < z-[600] шапки) и была не видна — пользователь не понимал, что город
          не выбран (UX-фидбек). Смещена под шапку. */}
      <div className="absolute top-40 md:top-[116px] left-1/2 -translate-x-1/2 md:left-[400px] md:translate-x-0 z-[200] pointer-events-none flex flex-col gap-2 items-start">
        {locating && (
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl px-4 py-2 rounded-full shadow-lg border border-slate-200/50 dark:border-slate-800/80 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 pointer-events-auto">
            <span className="w-3.5 h-3.5 border-2 border-emerald-600 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            {t('home.detectingCity')}
          </div>
        )}

        {!selectedCity && !locating && (
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl px-4 py-2 rounded-full shadow-lg border border-slate-200/50 dark:border-slate-800/80 text-xs font-bold text-slate-800 dark:text-slate-200 pointer-events-auto">
            {t('home.selectCityPrompt')}
          </div>
        )}
      </div>

      <div className="absolute right-4 top-24 md:top-24 z-[999] pointer-events-auto max-w-[220px] hidden md:block">
        <StopWatcher route={selectedRoute} watchedStop={watchedStop} onWatch={(stop) => setWatchedStop(stop)} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
