import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabase';
import { Vehicle, Route, Schedule } from '@/api/entities';
import {
  MapPin, Clock, Bus, CheckCircle, AlertCircle, AlertTriangle,
  Calendar, ChevronRight, TrendingUp, List,
} from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { useTrip } from '@/lib/TripContext';
import { savePendingStart } from '@/lib/tripStartHandoff';
import { summarizeShift, upcomingStops, hasIntermediateTimes, splitDuration } from '@/lib/scheduleLogic';

/** Дата смены: локализована через Intl, без жёсткой привязки к ru. */
const LOCALE_BY_LANG = { ru: 'ru-RU', en: 'en-US', tg: 'tg-TJ' };

function formatToday(now, lang) {
  const tag = LOCALE_BY_LANG[lang] || 'ru-RU';
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  let text;
  try {
    text = new Intl.DateTimeFormat(tag, options).format(now);
  } catch {
    text = new Intl.DateTimeFormat('ru-RU', options).format(now);
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «через 4 ч 20 мин» / «сейчас» — без склонений, одинаково для всех языков. */
function formatCountdown(minutes, t) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes <= 0) return t('schedule.nextTripNow');
  const { hours, minutes: rest } = splitDuration(minutes);
  if (hours === 0) return `${rest} ${t('schedule.minuteShort')}`;
  if (rest === 0) return `${hours} ${t('schedule.hourShort')}`;
  return `${hours} ${t('schedule.hourShort')} ${rest} ${t('schedule.minuteShort')}`;
}

function Card({ children, className = '' }) {
  return (
    <section className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 ${className}`}>
      {children}
    </section>
  );
}

function NextTripCard({ t, shift, route, startStopIndex, onStart, isTracking, onOpenMap }) {
  const countdown = formatCountdown(shift.minutesToNext, t);
  const isDepartingNow = shift.minutesToNext !== null && shift.minutesToNext <= 0;
  const countdownLabel = isDepartingNow
    ? t('schedule.nextTripNow')
    : countdown
      ? `${t('schedule.through')} ${countdown}`
      : null;
  const routeLabel = route
    ? `#${route.number} · ${route.stops?.length || 0} ${t('schedule.stopsAbbr')}`
    : '—';

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Clock size={15} className="text-blue-500" />
            {t('schedule.nextTrip')}
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">{routeLabel}</p>
        </div>
        {countdownLabel && (
          <span className="shrink-0 bg-blue-50 text-blue-700 text-[11px] font-bold px-2.5 py-1 rounded-full">
            {countdownLabel}
          </span>
        )}
      </div>

      <div className="flex items-end gap-3">
        <p
          className="text-5xl font-black tracking-tight text-slate-900 tabular-nums leading-none"
          aria-live="polite"
        >
          {shift.nextTime || '—'}
        </p>
        {shift.shiftStart && (
          <p className="text-[11px] text-slate-400 pb-1">
            {shift.shiftStart} – {shift.shiftEnd}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 gap-2">
          <span className="flex items-center gap-1.5">
            <TrendingUp size={13} className="text-indigo-500" />
            {t('schedule.shiftProgress')}
          </span>
          <span className="font-semibold text-slate-700 text-right">
            {t('schedule.passedOfTotal', { done: shift.passedTrips, total: shift.totalTrips })}
          </span>
        </div>
        <div
          className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shift.progress}
          aria-label={t('schedule.shiftProgress')}
        >
          <div
            className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${shift.progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-slate-400">
            {shift.nextTime ? t('schedule.nextTripHint') : t('schedule.noMoreTrips')}
          </span>
          <span className="text-[11px] text-indigo-600 font-semibold">{shift.progress}%</span>
        </div>
      </div>

      <button
        type="button"
        onClick={isTracking ? onOpenMap : () => onStart(startStopIndex)}
        className={`w-full min-h-[48px] rounded-xl text-white text-sm font-bold active:scale-[0.99] transition-all flex items-center justify-center gap-2 ${
          isTracking ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        <Bus size={16} />
        {isTracking ? t('schedule.openTrip') : t('schedule.startTrip')}
      </button>
    </Card>
  );
}

function ActiveStops({ t, stops }) {
  if (!stops.length) {
    return (
      <Card className="text-center text-slate-400 text-sm">
        <CheckCircle size={28} className="mx-auto mb-2 text-green-400" />
        {t('schedule.allStopsCompleted')}
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
        <MapPin size={15} className="text-green-500" />
        {t('schedule.activeStopsToday')}
        <span className="ml-auto bg-green-100 text-green-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
          {stops.length}
        </span>
      </h2>
      <div className="space-y-2">
        {stops.map((stop, i) => {
          const isNext = i === 0;
          return (
            <div
              key={`${stop.index}-${stop.time}`}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
                isNext ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-100'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                isNext ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {stop.index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${isNext ? 'text-green-800' : 'text-slate-700'}`}>
                  {stop.name || `${t('schedule.stopDefaultName')} ${stop.index + 1}`}
                </p>
                {isNext && (
                  <p className="text-[10px] text-green-600 font-medium">{t('schedule.nextStop')}</p>
                )}
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                isNext ? 'bg-green-200 text-green-800' : 'bg-white border border-slate-200 text-slate-600'
              }`}>
                {stop.time}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RoutePlan({ t, route, startStopIndex, onStartStop }) {
  const [expanded, setExpanded] = useState(false);
  if (!route?.stops?.length) return null;

  const stops = expanded ? route.stops : route.stops.slice(0, 5);
  const isUnscheduled = startStopIndex > 0;

  return (
    <Card className={`space-y-3 ${isUnscheduled ? 'border-yellow-300 bg-yellow-50' : ''}`}>
      <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
        <List size={15} className={isUnscheduled ? 'text-yellow-600' : 'text-blue-500'} />
        {t('schedule.routePlan')}
        {isUnscheduled && (
          <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {t('schedule.unscheduledBadge')}
          </span>
        )}
        <span className="ml-auto bg-blue-100 text-blue-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
          {route.stops.length} {t('schedule.stopsAbbr')}
        </span>
      </h2>

      <div className="relative">
        {/* Линия таймлайна: класс должен быть настоящим, без литеральных скобок. */}
        <div
          className={`absolute left-3.5 top-4 bottom-4 w-0.5 ${isUnscheduled ? 'bg-yellow-200' : 'bg-blue-100'}`}
          aria-hidden="true"
        />
        <div>
          {stops.map((stop, i) => {
            const isSelectedStart = i === startStopIndex;
            const isLast = i === route.stops.length - 1;
            return (
              <div key={`${stop.stop_index ?? i}-${i}`} className="flex items-center gap-3 py-1.5 relative">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 z-10 border-2 ${
                  isSelectedStart
                    ? isUnscheduled
                      ? 'bg-yellow-600 border-yellow-600 text-white'
                      : 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-300 text-slate-600'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate ${
                    isSelectedStart
                      ? isUnscheduled ? 'text-yellow-800' : 'text-blue-800'
                      : 'text-slate-700'
                  }`}>
                    {stop.name || `${t('schedule.stopDefaultName')} ${i + 1}`}
                  </p>
                  {isSelectedStart && (
                    <p className={`text-[10px] font-medium ${isUnscheduled ? 'text-yellow-700' : 'text-blue-600'}`}>
                      {isUnscheduled ? t('schedule.unscheduledDesc') : t('schedule.startLabel')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onStartStop(i)}
                  aria-label={`${t('schedule.startFromStop')}: ${stop.name || `${t('schedule.stopDefaultName')} ${i + 1}`}`}
                  className={`flex-shrink-0 min-h-[32px] px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                    isSelectedStart
                      ? isUnscheduled
                        ? 'bg-yellow-600 text-white border-yellow-600'
                        : 'bg-blue-600 text-white border-blue-600'
                      : isUnscheduled
                        ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {isSelectedStart ? t('schedule.inProgress') : t('schedule.startLabel')}
                </button>
                {isLast && !isSelectedStart && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">
                    {t('schedule.finishLabel')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {route.stops.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-full min-h-[40px] flex items-center justify-center gap-1 text-xs font-semibold rounded-xl transition-colors hover:bg-blue-50 text-blue-600"
        >
          {expanded ? t('collapse') : `${t('schedule.showAllStops')} ${route.stops.length}`}
          <ChevronRight size={13} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      )}
    </Card>
  );
}

export default function DriverSchedule() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { isTracking, endTrip } = useTrip();

  const [authed, setAuthed] = useState(null);
  const [user, setUser] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [route, setRoute] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [now, setNow] = useState(() => new Date());
  // С какой остановки водитель начинает рейс (0 = первая). Если не 0 — рейс неплановый.
  const [startStopIndex, setStartStopIndex] = useState(0);
  const isUnscheduled = startStopIndex > 0;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!authUser?.id) {
          setAuthed(false);
          setUser(null);
          return;
        }
        setAuthed(true);

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (cancelled) return;
        setUser(profile);

        if (!profile?.id) return;

        const vehicles = await Vehicle.filter({ driver_id: profile.id, is_active: true });
        if (cancelled) return;
        const activeVehicle = vehicles?.[0] || null;
        setVehicle(activeVehicle);

        if (!activeVehicle?.route_id) return;

        const routes = await Route.filter({ id: activeVehicle.route_id });
        if (cancelled) return;
        const activeRoute = routes?.[0] || null;
        setRoute(activeRoute);

        if (!activeRoute) return;
        const schedules = await Schedule.filter({ route_id: activeRoute.id });
        if (cancelled) return;
        setSchedule(schedules?.[0] || null);
      } catch (error) {
        if (cancelled) return;
        console.error('[DriverSchedule] не удалось загрузить расписание', error);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [reloadToken]);

  const shift = useMemo(() => summarizeShift(schedule, now), [schedule, now]);
  const stops = useMemo(() => upcomingStops(schedule, now), [schedule, now]);
  const hasStopTimes = useMemo(() => hasIntermediateTimes(schedule), [schedule]);

  /**
   * «Старт» на остановке: прерываем автоматический рейс (GPS-ретрансляция
   * из TripContext) и уходим на карту — там карта встанет к этой остановке,
   * водитель начнёт с неё вручную (жёлтая отметка непланового старта).
   * Выбор сохраняется до перехода — карта читает его одноразово.
   */
  const handleStartStop = (index) => {
    setStartStopIndex(index);
    savePendingStart({
      routeId: route?.id || null,
      stopIndex: index,
      stop: route?.stops?.[index] || null,
    });
    (async () => {
      try {
        if (isTracking) await endTrip(); // рейс больше не идёт «сам»
      } finally {
        navigate('/');
      }
    })();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" role="status" aria-live="polite">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <span className="sr-only">{t('loading')}</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-slate-600 font-medium">{t('schedule.loadError')}</p>
        <button
          type="button"
          onClick={() => setReloadToken((value) => value + 1)}
          className="min-h-[44px] px-5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
        >
          {t('schedule.retry')}
        </button>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
        <Bus size={48} className="text-blue-300" />
        <p className="text-slate-600 font-medium">{t('schedule.loginRequired')}</p>
        <Link
          to="/"
          className="min-h-[44px] px-5 inline-flex items-center rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
        >
          {t('schedule.loginAction')}
        </Link>
      </div>
    );
  }

  if (!user || user.role !== 'driver' || user.driver_status !== 'approved') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
        <AlertCircle size={48} className="text-amber-400" />
        <p className="text-slate-600 font-medium">{t('schedule.accessDenied')}</p>
        <p className="text-xs text-slate-400">{t('driver.passengerRoleMessage')}</p>
        <Link
          to="/profile"
          className="min-h-[44px] px-5 inline-flex items-center rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
        >
          {t('driver.goToProfile')}
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-6">

        <header className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur shrink-0">
              <Bus size={24} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg leading-tight truncate">
                {user?.full_name || user?.email || '—'}
              </p>
              <p className="text-blue-200 text-xs flex items-center gap-1 mt-0.5">
                <Calendar size={11} className="shrink-0" />
                <span className="truncate">{formatToday(now, lang)}</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-blue-200">{t('schedule.vehicleNumberLabel')}</p>
              <p className="font-bold text-white truncate">{vehicle?.vehicle_number || '—'}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-blue-200">{t('schedule.routeLabel')}</p>
              <p className="font-bold text-white">{route ? `#${route.number}` : '—'}</p>
            </div>
          </div>
        </header>

        {!vehicle && (
          <Card className="text-center text-slate-500 text-sm space-y-3">
            <Bus size={32} className="mx-auto text-slate-300" />
            <p>{t('schedule.noActiveTrip')}</p>
            <Link
              to="/profile"
              className="min-h-[44px] px-5 inline-flex items-center rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              {t('schedule.openProfile')}
            </Link>
          </Card>
        )}

        {isUnscheduled && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-r-xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-yellow-800">{t('schedule.unscheduledBadge')}</p>
                <p className="text-xs text-yellow-700 mt-0.5">{t('schedule.unscheduledDesc')}</p>
              </div>
            </div>
          </div>
        )}

        {vehicle && schedule && (
          <NextTripCard
            t={t}
            shift={shift}
            route={route}
            startStopIndex={startStopIndex}
            onStart={handleStartStop}
            isTracking={isTracking}
            onOpenMap={() => navigate('/driver-active-trip')}
          />
        )}

        {vehicle && schedule && hasStopTimes && <ActiveStops t={t} stops={stops} />}

        {vehicle && route && (
          <RoutePlan
            t={t}
            route={route}
            startStopIndex={startStopIndex}
            onStartStop={handleStartStop}
          />
        )}

        {vehicle && route && !schedule && (
          <Card className="text-center text-slate-400 text-sm">
            <Clock size={28} className="mx-auto mb-2 text-slate-300" />
            {t('schedule.noSchedule')}
          </Card>
        )}
      </div>
    </div>
  );
}
