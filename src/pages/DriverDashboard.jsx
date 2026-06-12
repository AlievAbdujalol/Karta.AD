import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Play, Square, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function DriverDashboard() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [cities, setCities] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [gpsInfo, setGpsInfo] = useState({ speed: 0, lat: 0, lng: 0 });
  const watchIdRef = useRef(null);
  const vehicleIdRef = useRef(null);

  useEffect(() => {
    base44.entities.City.list().then(setCities);
  }, []);

  useEffect(() => {
    if (user?.city_id) setSelectedCity(user.city_id);
  }, [user]);

  useEffect(() => {
    if (selectedCity) {
      base44.entities.Route.filter({ city_id: selectedCity }).then(setRoutes);
    }
  }, [selectedCity]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  if (!user) return (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('loading')}</div>
  );

  if (user.role !== 'driver') return (
    <div className="p-8 text-center space-y-4">
      <div className="text-5xl">🚌</div>
      <p className="text-gray-600 dark:text-gray-300 text-sm">{t('chooseRole')}: <strong>{t('driver')}</strong></p>
      <Link to="/profile" className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
        {t('editProfile')}
      </Link>
    </div>
  );

  const driverStatus = user.driver_status || 'pending';

  if (driverStatus === 'blocked') return (
    <div className="p-8 text-center space-y-2">
      <div className="text-5xl">🚫</div>
      <p className="font-semibold text-red-600 dark:text-red-400 text-lg">{t('blocked')}</p>
    </div>
  );

  if (driverStatus === 'pending') return (
    <div className="p-8 text-center space-y-3">
      <div className="text-5xl">⏳</div>
      <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{t('pending')}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('waitingApproval')}</p>
    </div>
  );

  const startTrip = async () => {
    if (!selectedRoute || !user) return;
    const route = routes.find(r => r.id === selectedRoute);

    const existingVehicles = await base44.entities.Vehicle.filter({ driver_id: user.id });
    let vId;

    if (existingVehicles.length > 0) {
      vId = existingVehicles[0].id;
      await base44.entities.Vehicle.update(vId, {
        route_id: selectedRoute,
        route_number: route?.number || '',
        is_active: true,
        type: route?.type || 'bus',
        driver_name: user.full_name || user.email,
        vehicle_number: user.vehicle_number || '',
      });
    } else {
      const v = await base44.entities.Vehicle.create({
        driver_id: user.id,
        route_id: selectedRoute,
        route_number: route?.number || '',
        is_active: true,
        type: route?.type || 'bus',
        driver_name: user.full_name || user.email,
        vehicle_number: user.vehicle_number || '',
        lat: 0,
        lng: 0,
      });
      vId = v.id;
    }

    vehicleIdRef.current = vId;

    if (!navigator.geolocation) {
      toast.error(t('locationAccess'));
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, speed: spd } = pos.coords;
        const speedKmh = spd ? Math.round(spd * 3.6) : 0;
        setGpsInfo({ speed: speedKmh, lat: latitude, lng: longitude });
        if (vehicleIdRef.current) {
          await base44.entities.Vehicle.update(vehicleIdRef.current, {
            lat: latitude,
            lng: longitude,
            speed: spd ? spd * 3.6 : 0,
            last_updated: new Date().toISOString(),
          });
        }
      },
      () => toast.error(t('locationAccess')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    setIsTracking(true);
    toast.success(t('startTrip'));
  };

  const endTrip = async () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (vehicleIdRef.current) {
      await base44.entities.Vehicle.update(vehicleIdRef.current, { is_active: false });
      vehicleIdRef.current = null;
    }
    setIsTracking(false);
    setGpsInfo({ speed: 0, lat: 0, lng: 0 });
    toast.success(t('endTrip'));
  };

  const currentRoute = routes.find(r => r.id === selectedRoute);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Status banner */}
        <div className={`rounded-2xl p-5 text-white transition-colors ${isTracking ? 'bg-green-600' : 'bg-blue-700'}`}>
          <div className="flex items-center gap-3">
            {isTracking && <span className="w-3 h-3 bg-white rounded-full animate-pulse flex-shrink-0" />}
            <div>
              <p className="font-bold text-lg">{isTracking ? t('tracking') : t('driverPanel')}</p>
              {isTracking && currentRoute && (
                <p className="text-sm opacity-90">
                  {currentRoute.type === 'bus' ? t('bus') : t('minibus')} #{currentRoute.number}
                </p>
              )}
              {isTracking && gpsInfo.speed > 0 && (
                <p className="text-sm opacity-80">{gpsInfo.speed} {t('speed')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">{t('city')}</label>
            <select
              value={selectedCity}
              onChange={e => { setSelectedCity(e.target.value); setSelectedRoute(''); }}
              disabled={isTracking}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm disabled:opacity-50 bg-white dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">{t('selectCity')}</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">{t('selectYourRoute')}</label>
            <select
              value={selectedRoute}
              onChange={e => setSelectedRoute(e.target.value)}
              disabled={isTracking || !selectedCity}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm disabled:opacity-50 bg-white dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">{t('selectRoute')}</option>
              {routes.map(r => (
                <option key={r.id} value={r.id}>
                  #{r.number} — {r.type === 'bus' ? t('bus') : t('minibus')} {r.name || ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={isTracking ? endTrip : startTrip}
            disabled={!isTracking && !selectedRoute}
            className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-base ${
              isTracking
                ? 'bg-red-500 hover:bg-red-600 active:scale-95'
                : 'bg-green-600 hover:bg-green-700 active:scale-95'
            }`}
          >
            {isTracking ? <Square size={20} /> : <Play size={20} fill="currentColor" />}
            {isTracking ? t('endTrip') : t('startTrip')}
          </button>
        </div>

        {/* GPS coords */}
        {isTracking && gpsInfo.lat !== 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-2">
            <Navigation size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {gpsInfo.lat.toFixed(5)}, {gpsInfo.lng.toFixed(5)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}