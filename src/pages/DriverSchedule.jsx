import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { Vehicle, Route, Schedule } from '@/api/entities';
import { MapPin, Clock, Bus, CheckCircle, AlertCircle, Calendar, ChevronRight, TrendingUp, List } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useLanguage } from '@/lib/useLanguage';

const timeToMinutes = (t) => {
  const [h, m] = (t || '').split(':').map(Number);
  return h * 60 + m;
};

const getNowMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

function ShiftSummary({ schedule }) {
  const { t } = useLanguage();
  if (!schedule?.stops_schedule?.length) return null;

  const allTimes = schedule.stops_schedule.flatMap(s => s.times || []);
  if (!allTimes.length) return null;

  const sorted = [...allTimes].sort();
  const shiftStart = sorted[0];
  const shiftEnd = sorted[sorted.length - 1];
  const now = getNowMinutes();
  const totalTrips = allTimes.length;
  const completedTrips = allTimes.filter(t => timeToMinutes(t) < now).length;
  const progress = Math.round((completedTrips / totalTrips) * 100);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
      <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
        <TrendingUp size={15} className="text-indigo-500" />
        {t('schedule.myShift')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-indigo-700">{shiftStart}</p>
          <p className="text-[11px] text-indigo-400 mt-0.5">{t('schedule.shiftStart')}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-purple-700">{shiftEnd}</p>
          <p className="text-[11px] text-purple-400 mt-0.5">{t('schedule.shiftEnd')}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>{t('schedule.shiftProgress')}</span>
          <span className="font-semibold text-gray-700">{completedTrips} / {totalTrips} {t('schedule.tripsCount')}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-indigo-500 h-2.5 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-right text-[11px] text-indigo-600 font-semibold mt-1">{progress}%</p>
      </div>
    </div>
  );
}

function ActiveStops({ schedule, route }) {
  const { t } = useLanguage();
  if (!schedule?.stops_schedule?.length) return null;
  const now = getNowMinutes();

  const activeStops = schedule.stops_schedule
    .map((s, i) => {
      const upcoming = (s.times || []).filter(t => timeToMinutes(t) >= now);
      return { ...s, index: i, upcoming, next: upcoming[0] || null };
    })
    .filter(s => s.next !== null)
    .slice(0, 10);

  if (!activeStops.length) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-gray-400 text-sm">
        <CheckCircle size={28} className="mx-auto mb-2 text-green-400" />
        {t('schedule.allStopsCompleted')}
      </div>
    );
  }

  const firstNextIdx = activeStops.findIndex(s => s.next !== null);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
        <MapPin size={15} className="text-green-500" />
        {t('schedule.activeStopsToday')}
        <span className="ml-auto bg-green-100 text-green-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
          {activeStops.length}
        </span>
      </h2>
      <div className="space-y-2">
        {activeStops.map((stop, i) => {
          const isNext = i === firstNextIdx;
          return (
            <div
              key={stop.index}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
                isNext
                  ? 'bg-green-50 border-green-300'
                  : 'bg-gray-50 border-gray-100'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                isNext ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {stop.index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${isNext ? 'text-green-800' : 'text-gray-700'}`}>
                  {stop.stop_name || `${t('schedule.stopDefaultName')} ${stop.index + 1}`}
                </p>
                {isNext && (
                  <p className="text-[10px] text-green-600 font-medium">{t('schedule.nextStop')}</p>
                )}
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                isNext ? 'bg-green-200 text-green-800' : 'bg-white border border-gray-200 text-gray-600'
              }`}>
                {stop.next}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoutePlan({ route }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  if (!route?.stops?.length) return null;

  const stops = expanded ? route.stops : route.stops.slice(0, 5);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
      <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
        <List size={15} className="text-blue-500" />
        {t('schedule.routePlan')}
        <span className="ml-auto bg-blue-100 text-blue-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
          {route.stops.length} {t('schedule.stopsAbbr')}
        </span>
      </h2>
      <div className="relative">
        <div className="absolute left-3.5 top-4 bottom-4 w-0.5 bg-blue-100" />
        <div className="space-y-0">
          {stops.map((stop, i) => {
            const isFirst = i === 0;
            const isLast = i === route.stops.length - 1 && expanded;
            return (
              <div key={i} className="flex items-center gap-3 py-1.5 relative">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 z-10 border-2 ${
                  isFirst || isLast
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-blue-300 text-blue-600'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-700">{stop.name || `${t('schedule.stopDefaultName')} ${i + 1}`}</p>
                </div>
                {(isFirst) && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">{t('schedule.startLabel')}</span>
                )}
                {i === route.stops.length - 1 && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">{t('schedule.finishLabel')}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {route.stops.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 text-xs text-blue-600 font-semibold py-1 hover:bg-blue-50 rounded-xl transition-all"
        >
          {expanded ? t('collapse') : `${t('schedule.showAllStops')} ${route.stops.length}`}
          <ChevronRight size={13} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      )}
    </div>
  );
}

export default function DriverSchedule() {
  const { t } = useLanguage();
  const [user, setUser] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      setUser(profile);

      if (!profile?.id) { setLoading(false); return; }

      const vehicles = await Vehicle.filter({ driver_id: profile.id, is_active: true });
      const v = vehicles[0] || null;
      setVehicle(v);

      if (v?.route_id) {
        const routes = await Route.filter({ id: v.route_id });
        const r = routes[0] || null;
        setRoute(r);
        if (r) {
          const schedules = await Schedule.filter({ route_id: r.id });
          setSchedule(schedules[0] || null);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const today = format(new Date(), 'EEEE, d MMMM yyyy', { locale: ru });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (user.role !== 'driver' || user.driver_status !== 'approved') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
        <AlertCircle size={48} className="text-amber-400" />
        <p className="text-gray-600 font-medium">{t('schedule.accessDenied')}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-6">

        <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur">
              <Bus size={24} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">{user.full_name || user.email}</p>
              <p className="text-blue-200 text-xs flex items-center gap-1 mt-0.5">
                <Calendar size={11} /> {today}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-blue-200">{t('schedule.vehicleNumberLabel')}</p>
              <p className="font-bold text-white">{vehicle?.vehicle_number || '—'}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-blue-200">{t('schedule.routeLabel')}</p>
              <p className="font-bold text-white">
                {route ? `#${route.number}` : '—'}
              </p>
            </div>
          </div>
        </div>

        {!vehicle && (
          <div className="bg-white rounded-2xl p-5 shadow-sm text-center text-gray-400 text-sm space-y-2">
            <Bus size={32} className="mx-auto text-gray-300" />
            <p>{t('schedule.noActiveTrip')}</p>
          </div>
        )}

        <ShiftSummary schedule={schedule} />
        <ActiveStops schedule={schedule} route={route} />
        <RoutePlan route={route} />

        {route && !schedule && (
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-gray-400 text-sm">
            <Clock size={28} className="mx-auto mb-2 text-gray-300" />
            {t('schedule.noSchedule')}
          </div>
        )}
      </div>
    </div>
  );
}
