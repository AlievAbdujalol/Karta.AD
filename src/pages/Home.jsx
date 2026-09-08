import { useState, useEffect, useCallback } from 'react';
import { City, FavoriteRoute, TripLog } from '@/api/entities';
import { supabase } from '@/api/supabase';
import { useLanguage, LANG_KEY } from '@/lib/useLanguage';
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

export default function Home() {
  const { t, lang, setLang } = useLanguage();
  const { user: currentUser } = useCurrentUser();
  const { contactLocations, shareWith, unshareWith } = useLocationSharing(currentUser?.id);
  const { groupRoute, members, onlineMembers, sharingEnabled: groupSharingEnabled, createGroup, joinGroup, leaveGroup, finishGroup, toggleSharing: toggleGroupSharing, myPosition, meetPoint } = useGroupRoute(currentUser?.id);
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
    if (!navigator.geolocation) return;
    if (localStorage.getItem('karta_city')) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
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
      },
      () => setLocating(false),
      { timeout: 6000, maximumAge: 60000 }
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

  useEffect(() => {
    if (selectedCity) {
      supabase.from('routes').select('*')
        .or(`city_id.is.null,city_id.eq.${selectedCity.id}`)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setRoutes(data || []);
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

  useEffect(() => {
    let interval;
    let retryDelay = 5000;

    const fetchVehicles = async () => {
      if (!selectedCity) { setVehicles([]); return; }
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
    return () => clearInterval(interval);
  }, [selectedCity, selectedRoute, routes]);

  const mapCenter = selectedCity?.lat && selectedCity?.lng
    ? [selectedCity.lat, selectedCity.lng]
    : [38.559, 68.773];

  const handleLocateUser = useCallback(() => {
    if (!navigator.geolocation) { toast.error('Геолокация не поддерживается'); return; }
    toast.loading('Ищем вас на карте…', { id: 'locate-home' });
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      toast.dismiss('locate-home');
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
    }, (err) => {
      toast.dismiss('locate-home');
      if (err.code === 1) toast.error('Разрешите доступ к геолокации в настройках браузера');
      else toast.error('Не удалось определить местоположение');
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  }, [routes]);

  return (
    <div className="relative w-full h-full bg-slate-50 dark:bg-slate-950 overflow-hidden select-none">
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
      {nav.isActive && <div className="absolute bottom-[136px] left-2 z-[550] opacity-90 hover:opacity-100 transition-opacity pointer-events-none"><MiniMap center={nav.userPosition||mapCenter} route={nav.routeData} userPos={nav.userPosition} heading={nav.userHeading}/></div>}
      {nav.isActive && (
        <div className="absolute top-[58px] left-2 right-20 z-[550] pointer-events-auto">
          <div className="bg-slate-900/90 backdrop-blur text-white rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg border border-white/10 max-w-[280px]">
            <span className="text-[11px] leading-tight flex-1">Отправляйте друзьям свою геопозицию в реальном времени</span>
            <button onClick={()=>{ try{navigator.share?.({title:'Геопозиция', url: window.location.href});}catch{} }} className="text-emerald-400 text-[11px] font-bold whitespace-nowrap">Делиться</button>
          </div>
        </div>
      )}
      <button onClick={()=>{ try{ navigator.vibrate?.(50); }catch{} if(!eventsOpen){ setTimeout(()=> setEventsOpen(true), 70); setEventPos(null); } else setEventsOpen(false); }} className="absolute left-2 bottom-[160px] z-[500] w-9 h-9 rounded-2xl bg-white dark:bg-slate-900 border shadow flex items-center justify-center text-[10px] font-black">{eventsOpen?'×':'!'}</button>

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

      <div className="absolute top-40 md:top-3 left-1/2 -translate-x-1/2 md:left-[400px] md:translate-x-0 z-[200] pointer-events-none flex flex-col gap-2 items-start">
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
