import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import BusMap from '@/components/BusMap';
import StopWatcher from '@/components/StopWatcher';
import { useStopNotifier } from '@/hooks/useStopNotifier';
import SchedulePanel from '@/components/SchedulePanel';
import HomeHeader from '@/components/HomeHeader';
import { WifiOff } from 'lucide-react';
import { saveCache, loadCache } from '@/hooks/useOfflineCache';
import { useCurrentUser } from '@/lib/useCurrentUser';
import ErrorBoundary, { BusMapErrorFallback } from '@/components/ErrorBoundary';
import { useNotificationCount } from '@/lib/NotificationContext';

export default function Home() {
  const { t, lang, setLang } = useLanguage();
  const { user: currentUser } = useCurrentUser();
  const [cities, setCities] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedType, setSelectedType] = useState('all');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [watchedStop, setWatchedStop] = useState(null);
  const { notifications, clear: clearNotifications, addLocalNotification } = useNotificationCount();
  const [favorites, setFavorites] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [locating, setLocating] = useState(false);

  // ── Автоопределение ближайшего города по геолокации ────────────────────────
  const autoDetectCity = useCallback((citiesList) => {
    if (!citiesList?.length) return;
    if (!navigator.geolocation) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Находим ближайший город по расстоянию
        let nearest = null;
        let minDist = Infinity;
        citiesList.forEach(city => {
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

  const toggleFavorite = async (route) => {
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

  const logTrip = async (route) => {
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
    onNotification: (n) => addLocalNotification(n),
  });

  useEffect(() => {
    base44.entities.City.list().then(data => {
      setCities(data);
      saveCache('cities', data);
      const unique = [...new Set(data.map(c => c.country).filter(Boolean))];
      setCountries(unique);
      setIsOffline(false);
      // Автоопределяем город если ещё не выбран
      autoDetectCity(data);
    }).catch(() => {
      const cached = loadCache('cities');
      if (cached) {
        setCities(cached);
        const unique = [...new Set(cached.map(c => c.country).filter(Boolean))];
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#f3f4f6' }}>
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
      />

      {isOffline && (
        <div className="bg-amber-500 text-white text-xs font-medium px-4 py-1.5 flex items-center justify-center gap-2 flex-shrink-0">
          <WifiOff size={12} />
          Нет соединения — показаны последние сохранённые данные
        </div>
      )}

      {/* Map — занимает всё оставшееся пространство */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%' }}>

        {/* Определение города */}
        {locating && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            background: 'white', borderRadius: 24, padding: '8px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1565C0', fontWeight: 600,
            whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #1565C0',
              borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Определяем ваш город...
          </div>
        )}

        {!selectedCity && !locating && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)', borderRadius: 24,
            padding: '8px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            fontSize: 12, color: '#555', fontWeight: 500, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            📍 Выберите город для просмотра маршрутов
          </div>
        )}

        {vehicles.length === 0 && selectedCity && !locating && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)', borderRadius: 24,
            padding: '8px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            fontSize: 12, color: '#555', pointerEvents: 'none' }}>
            {t('noActiveVehicles')}
          </div>
        )}

        {/* StopWatcher */}
        <div style={{ position: 'absolute', right: 64, top: 12, zIndex: 1000 }}>
          <StopWatcher route={selectedRoute} watchedStop={watchedStop} onWatch={stop => setWatchedStop(stop)} />
        </div>

        <ErrorBoundary fallback={(error) => <BusMapErrorFallback error={error} />}>
          <BusMap vehicles={vehicles} route={selectedRoute} center={mapCenter} watchedStop={watchedStop} showDefault={true} />
        </ErrorBoundary>
        <SchedulePanel route={selectedRoute} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}