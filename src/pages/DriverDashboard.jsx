import { useState, useEffect } from 'react';
import { City } from '@/api/entities';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useTrip } from '@/lib/TripContext';
import { Play, Square, Navigation, Bus, Gauge, Truck } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function DriverDashboard() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const { isTracking, gpsInfo, activeRoute, startTrip, endTrip } = useTrip();
  const [cities, setCities] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState(user?.vehicle_number || '');
  const [liveStatus, setLiveStatus] = useState(null);
  const [liveRole, setLiveRole] = useState(null);

  const fetchStatus = () => {
    if (!user?.id) return;
    supabase.from('profiles').select('driver_status, role').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          setLiveStatus(data.driver_status);
          setLiveRole(data.role);
        }
      }).catch(() => {});
  };

  useEffect(() => {
    City.list().then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.city_id) setSelectedCity(user.city_id);
  }, [user]);

  useEffect(() => {
    const q = supabase.from('routes').select('*').not('created_by_id', 'is', null);
    if (selectedCity) q.eq('city_id', selectedCity);
    q.order('created_at', { ascending: false });
    q.then(({ data }) => setRoutes(data || [])).catch(() => {});
  }, [selectedCity]);

  useEffect(() => {
    const to = setTimeout(fetchStatus, 2000);
    const iv = setInterval(fetchStatus, 15000);
    return () => { clearTimeout(to); clearInterval(iv); };
  }, [user?.id]);

  if (!user) return (
    <div className="p-8 text-center text-slate-400 font-medium">{t('loading')}</div>
  );

  const effectiveRole = liveRole || user.role;

  if (effectiveRole !== 'driver') return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 select-none">
      <div className="max-w-md w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-8 border border-slate-200/60 dark:border-slate-800/80 shadow-2xl text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/50 text-amber-500 flex items-center justify-center mx-auto border border-amber-200 dark:border-amber-800">
          <Bus size={32} />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t('driver.driversOnly')}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('driver.passengerRoleMessage')}</p>
        <Link to="/profile" className="inline-block bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 transition-all">
          {t('driver.goToProfile')}
        </Link>
      </div>
    </div>
  );

  const driverStatus = liveStatus || user.driver_status || 'pending';

  if (driverStatus === 'blocked') return (
    <div className="p-8 text-center space-y-2">
      <div className="text-5xl">🚫</div>
      <p className="font-bold text-rose-600 dark:text-rose-400 text-base">{t('blocked')}</p>
    </div>
  );

  if (driverStatus === 'pending') return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 select-none">
      <div className="max-w-md w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-8 border border-slate-200/60 dark:border-slate-800/80 shadow-2xl text-center space-y-3">
        <div className="text-4xl">⏳</div>
        <h3 className="font-extrabold text-slate-900 dark:text-white text-base">{t('pending')}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('waitingApproval')}</p>
      </div>
    </div>
  );

  const currentRoute = activeRoute || routes.find(r => r.id === selectedRoute);

  const handleStart = async () => {
    if (!selectedRoute || !user) return;
    try {
      await startTrip({ routeId: selectedRoute, vNumber: vehicleNumber, driverRoutes: routes, user });
    } catch (err) {
      toast.error(err.message || t('driver.startTripError'));
    }
  };

  const handleEnd = async () => {
    try {
      await endTrip();
    } catch (err) {
      toast.error(err.message || t('driver.endTripError'));
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 p-4 md:p-8 select-none">
      <div className="max-w-xl mx-auto space-y-6 pb-20">
        <div className={`rounded-3xl p-6 text-white transition-all shadow-xl ${
          isTracking
            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-600/20'
            : 'bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-slate-950 border border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isTracking && <span className="w-2.5 h-2.5 bg-white rounded-full animate-ping" />}
                <span className="text-xs font-black uppercase tracking-wider opacity-90">
                  {isTracking ? t('driver.tripActive') : t('driver.driverPanel')}
                </span>
              </div>
              <h2 className="text-xl font-extrabold">
                {isTracking && currentRoute ? `${t('driver.routeLabel')} #${currentRoute.number}` : t('driver.readyToStart')}
              </h2>
              {isTracking && currentRoute && (
                <p className="text-xs opacity-80">{currentRoute.name || t('driver.cityRouteDefault')}</p>
              )}
            </div>

            {isTracking && (
              <div className="text-right bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20">
                <div className="flex items-center gap-1 text-xs font-bold">
                  <Gauge size={14} />
                  <span>{gpsInfo.speed} {t('speedUnit')}</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider opacity-70">{t('driver.speedLabel')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-xl space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{t('city')}</label>
            <select
              value={selectedCity}
              onChange={e => { setSelectedCity(e.target.value); setSelectedRoute(''); }}
              disabled={isTracking}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none disabled:opacity-50"
            >
              <option value="">{t('selectCity')}</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              <Truck size={14} className="inline mr-1" />{t('vehicleNumber')}
            </label>
            <input
              type="text"
              value={vehicleNumber}
              onChange={e => setVehicleNumber(e.target.value)}
              disabled={isTracking}
              placeholder={t('driver.vehicleNumberPlaceholder')}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{t('selectYourRoute')}</label>
            <select
              value={isTracking ? activeRoute?.id || '' : selectedRoute}
              onChange={e => setSelectedRoute(e.target.value)}
              disabled={isTracking}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none disabled:opacity-50"
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
            onClick={isTracking ? handleEnd : handleStart}
            disabled={!isTracking && !selectedRoute}
            className={`w-full py-4 rounded-2xl font-bold text-xs uppercase tracking-wider text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg active:scale-95 ${
              isTracking
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/20'
            }`}
          >
            {isTracking ? <Square size={16} /> : <Play size={16} fill="currentColor" />}
            {isTracking ? t('endTrip') : t('startTrip')}
          </button>
        </div>

        {isTracking && gpsInfo.lat !== 0 && (
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 shadow-md flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-500 flex items-center justify-center">
              <Navigation size={16} />
            </div>
            <div>
              <div className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('driver.currentGpsCoords')}</div>
              <p className="text-xs text-slate-800 dark:text-slate-200 font-mono font-bold mt-0.5">
                {gpsInfo.lat.toFixed(5)}, {gpsInfo.lng.toFixed(5)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
