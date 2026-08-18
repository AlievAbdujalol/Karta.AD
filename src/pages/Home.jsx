import { useState, useEffect, useCallback } from 'react';
import { City, Vehicle, FavoriteRoute, TripLog } from '@/api/entities';
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

export default function Home() {
  const { t, lang, setLang } = useLanguage();
  const { user: currentUser } = useCurrentUser();
  const { contactLocations, shareWith, unshareWith } = useLocationSharing(currentUser?.id);
  const { groupRoute, members, onlineMembers, sharingEnabled: groupSharingEnabled, createGroup, joinGroup, leaveGroup, finishGroup, toggleSharing: toggleGroupSharing } = useGroupRoute(currentUser?.id);
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'transport') {
      setActiveTab('routes');
      setSheetState('half');
    }
  }, [location.search]);

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

  const handleSelectResult = useCallback((item) => {
    setSearchResult(item);
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
  }, [routes]);

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
      const query = selectedRoute
        ? { route_id: selectedRoute.id, is_active: true }
        : { is_active: true };
      try {
        const all = await Vehicle.filter(query);
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

  return (
    <div className="relative w-full h-full bg-slate-50 dark:bg-slate-950 overflow-hidden select-none">
      <div className="absolute inset-0 w-full h-full z-0">
        <ErrorBoundary fallback={(error) => <BusMapErrorFallback error={error} />}>
          <BusMap vehicles={vehicles} route={selectedRoute} center={mapCenter} watchedStop={watchedStop} flyTo={flyTo} onFlyDone={() => setFlyTo(null)} routes={routes} onRoutingOpen={() => setSheetState('collapsed')} onRoutingStateChange={setRoutingOpen} contactLocations={contactLocations} groupRouteMembers={onlineMembers} onShareTrip={handleShareTrip} groupRoute={groupRoute} panelVisible={panelVisible} />
        </ErrorBoundary>
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

      {/* Group Route Panel */}
      {panelVisible && (
        <GroupRoutePanel
          groupRoute={groupRoute}
          members={members}
          onlineMembers={onlineMembers}
          sharingEnabled={groupSharingEnabled}
          onLeave={leaveGroup}
          onFinish={finishGroup}
          onToggleSharing={toggleGroupSharing}
          contactLocations={contactLocations}
          onShareWith={shareWith}
          onUnshareWith={unshareWith}
          onClose={() => setPanelVisible(false)}
        />
      )}

      <BottomSheet
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
      />

      <SchedulePanel route={selectedRoute} hidden={routingOpen} />

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
