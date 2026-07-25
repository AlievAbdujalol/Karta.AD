import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import BusMap from '@/components/BusMap';
import StopWatcher from '@/components/StopWatcher';
import { useStopNotifier } from '@/hooks/useStopNotifier';
import SchedulePanel from '@/components/SchedulePanel';
import HomeHeader from '@/components/HomeHeader';
import { WifiOff, Zap } from 'lucide-react';
import { saveCache, loadCache } from '@/hooks/useOfflineCache';
import { useCurrentUser } from '@/lib/useCurrentUser';
import ErrorBoundary, { BusMapErrorFallback } from '@/components/ErrorBoundary';
import { useNotificationCount } from '@/lib/NotificationContext';
import { useLocation } from 'react-router-dom';
import BottomSheet from '@/components/BottomSheet';

export default function Home() {
  const { t, lang, setLang } = useLanguage();
  const { user: currentUser } = /** @type {any} */ (useCurrentUser());
  const [cities, setCities] = useState(/** @type {any[]} */ ([]));
  const [routes, setRoutes] = useState(/** @type {any[]} */ ([]));
  const [vehicles, setVehicles] = useState(/** @type {any[]} */ ([]));
  const [countries, setCountries] = useState(/** @type {any[]} */ ([]));
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState(/** @type {any} */ (null));
  const [selectedType, setSelectedType] = useState('all');
  const [selectedRoute, setSelectedRoute] = useState(/** @type {any} */ (null));
  const [watchedStop, setWatchedStop] = useState(/** @type {any} */ (null));
  const { notifications, clear: clearNotifications, addLocalNotification } = useNotificationCount();
  const [favorites, setFavorites] = useState(/** @type {any[]} */ ([]));
  const [isOffline, setIsOffline] = useState(false);
  const [locating, setLocating] = useState(false);

  const location = useLocation();
  const [sheetState, setSheetState] = useState('collapsed');
  const [activeTab, setActiveTab] = useState('stops');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'transport') {
      setActiveTab('routes');
      setSheetState('half');
    }
  }, [location.search]);

  // ── Автоопределение ближайшего города по геолокации ────────────────────────
  const autoDetectCity = useCallback(/** @param {any[]} citiesList */ (citiesList) => {
    if (!citiesList?.length) return;
    if (!navigator.geolocation) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Находим ближайший город по расстоянию
        /** @type {any} */ let nearest = null;
        let minDist = Infinity;
        citiesList.forEach(/** @param {any} city */ city => {
          if (!city.lat || !city.lng) return;
          const d = Math.hypot(city.lat - latitude, city.lng - longitude);
          if (d < minDist) { minDist = d; nearest = city; }
        });
        if (nearest && minDist < 2) {
          // В радиусе ~200км
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
      base44.entities.FavoriteRoute.filter({ user_id: currentUser.id })
        .then(f => setFavorites(f.map(x => x.route_id)))
        .catch(() => {});
    }
  }, [currentUser?.id]);

  const toggleFavorite = async (/** @type {any} */ route) => {
    if (!currentUser) return;
    const isFav = favorites.includes(route.id);
    if (isFav) {
      const existing = await base44.entities.FavoriteRoute.filter({ user_id: currentUser.id, route_id: route.id });
      if (existing[0]) await base44.entities.FavoriteRoute.delete(existing[0].id);
      setFavorites(f => f.filter(id => id !== route.id));
    } else {
      const city = cities.find(c => c.id === route.city_id);
      await base44.entities.FavoriteRoute.create({
        user_id: currentUser.id, route_id: route.id,
        route_number: route.number, route_name: route.name,
        route_type: route.type, route_color: route.color,
        city_name: city?.name || '',
      });
      setFavorites(f => [...f, route.id]);
    }
  };

  const logTrip = async (/** @type {any} */ route) => {
    if (!currentUser || !route) return;
    const city = cities.find(c => c.id === route.city_id);
    await base44.entities.TripLog.create({
      user_id: currentUser.id, route_id: route.id,
      route_number: route.number, route_name: route.name,
      route_type: route.type, route_color: route.color,
      city_name: city?.name || '',
    });
  };

  useStopNotifier({
    vehicles,
    watchedStop,
    route: selectedRoute,
    onNotification: /** @param {any} n */ (n) => addLocalNotification(n),
  });

  useEffect(() => {
    base44.entities.City.list().then(data => {
      setCities(data);
      saveCache('cities', data);
      const unique = [...new Set(data.map(/** @param {any} c */ c => c.country).filter(Boolean))];
      setCountries(unique);
      setIsOffline(false);
      // Автоопределяем город если ещё не выбран
      autoDetectCity(data);
    }).catch(() => {
      const cached = loadCache('cities');
      if (cached) {
        setCities(cached);
        const unique = [...new Set(cached.map(/** @param {any} c */ c => c.country).filter(Boolean))];
        setCountries(unique);
        setIsOffline(true);
        autoDetectCity(cached);
      }
    });
  }, [autoDetectCity]);

  const filteredCities = selectedCountry ? cities.filter(c => c.country === selectedCountry) : cities;

  useEffect(() => {
    if (selectedCity) {
      base44.entities.Route.filter({ city_id: selectedCity.id }).then(data => {
        setRoutes(data);
        saveCache('routes_' + selectedCity.id, data);
        setIsOffline(false);
      }).catch(() => {
        const cached = loadCache('routes_' + selectedCity.id);
        if (cached) { setRoutes(cached); setIsOffline(true); }
      });
    } else {
      setRoutes([]);
      setSelectedRoute(null);
    }
  }, [selectedCity]);

  const filteredRoutes = selectedType === 'all' ? routes : routes.filter(r => r.type === selectedType);

  useEffect(() => {
    const fetchVehicles = async () => {
      if (!selectedCity) { setVehicles([]); return; }
      const query = selectedRoute
        ? { route_id: selectedRoute.id, is_active: true }
        : { is_active: true };
      try {
        const all = await base44.entities.Vehicle.filter(query);
        const result = selectedRoute ? all : all.filter(v => new Set(routes.map(r => r.id)).has(v.route_id));
        setVehicles(result);
        saveCache('vehicles_' + selectedCity.id, result);
        setIsOffline(false);
      } catch {
        const cached = loadCache('vehicles_' + selectedCity.id);
        if (cached) { setVehicles(cached); setIsOffline(true); }
      }
    };
    fetchVehicles();
    const interval = setInterval(fetchVehicles, 5000);
    return () => clearInterval(interval);
  }, [selectedCity, selectedRoute, routes]);

  const mapCenter = selectedCity?.lat && selectedCity?.lng
    ? [selectedCity.lat, selectedCity.lng]
    : [38.559, 68.773];

  return (
    <div className="relative w-full h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Map (Background) */}
      <div className="absolute inset-0 w-full h-full z-0">
        <ErrorBoundary fallback={/** @param {any} error */ (error) => <BusMapErrorFallback error={error} />}>
          <BusMap vehicles={/** @type {any} */ (vehicles)} route={selectedRoute} center={mapCenter} watchedStop={watchedStop} />
        </ErrorBoundary>
      </div>

      {/* Floating Header */}
      <div className="absolute top-0 left-0 right-0 md:top-4 md:left-4 md:right-auto md:w-[380px] z-[1001] pointer-events-none px-4 pt-3 md:px-0 md:pt-0">
        <div className="pointer-events-auto">
          <HomeHeader
            lang={lang} setLang={setLang}
            countries={countries}
            selectedCountry={selectedCountry} setSelectedCountry={setSelectedCountry}
            cities={cities} filteredCities={filteredCities}
            selectedCity={selectedCity} setSelectedCity={/** @param {any} city */ (city) => { setSelectedCity(city); setSelectedRoute(null); }}
            selectedType={selectedType} setSelectedType={setSelectedType}
            routes={routes} filteredRoutes={filteredRoutes}
            selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute}
            favorites={favorites} toggleFavorite={toggleFavorite}
            logTrip={logTrip}
            notifications={notifications}
            onClearNotifications={clearNotifications}
          />
        </div>

        {isOffline && (
          <div className="mt-2 bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-1.5 rounded-xl flex items-center justify-center gap-1.5 shadow pointer-events-auto animate-pulse">
            <WifiOff size={11} />
            Офлайн режим (кэшированные данные)
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) "Маршрут" */}
      {selectedCity && (
        <button
          onClick={() => {
            setActiveTab('routes');
            setSheetState(sheetState === 'collapsed' ? 'half' : 'collapsed');
          }}
          className="absolute bottom-20 md:bottom-6 right-4 z-[999] flex items-center gap-2 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all duration-300 pointer-events-auto border border-blue-500/20"
        >
          <Zap size={15} className="fill-white" />
          <span className="text-xs font-bold tracking-wider">Маршрут</span>
        </button>
      )}

      {/* Interactive Bottom Sheet */}
      <BottomSheet
        selectedCity={selectedCity}
        routes={/** @type {any} */ (routes)}
        vehicles={/** @type {any} */ (vehicles)}
        favorites={/** @type {any} */ (favorites)}
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
      />

      {/* Schedule Panel - sits responsively to the right of the Sidebar on desktop */}
      <SchedulePanel route={selectedRoute} />

      {/* Info Pills */}
      <div className="absolute top-24 md:top-[100px] left-1/2 -translate-x-1/2 z-[998] pointer-events-none flex flex-col gap-2 items-center">
        {locating && (
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-full shadow-md border border-white/20 flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <span className="w-3.5 h-3.5 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
            Определяем город...
          </div>
        )}

        {!selectedCity && !locating && (
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-5 py-2.5 rounded-full shadow-md border border-white/20 text-xs font-semibold text-slate-700 dark:text-slate-200">
            📍 Выберите город для просмотра маршрутов
          </div>
        )}

        {vehicles.length === 0 && selectedCity && !locating && (
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-5 py-2.5 rounded-full shadow-md border border-white/20 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t('noActiveVehicles')}
          </div>
        )}
      </div>

      {/* StopWatcher */}
      <div className="absolute right-4 top-24 z-[999] pointer-events-auto max-w-[200px]">
        <StopWatcher route={selectedRoute} watchedStop={watchedStop} onWatch={/** @param {any} stop */ stop => setWatchedStop(stop)} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}