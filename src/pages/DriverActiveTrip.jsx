import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bus, MapPin, Clock, Navigation, Square, AlertCircle, Gauge, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useTrip } from '@/lib/TripContext';
import { supabase } from '@/api/supabase';
import { Schedule } from '@/api/entities';
import {
  routeProgressByStops,
  estimateArrivalMinutes,
  formatDistanceM,
} from '@/lib/trackingLogic';
import { toMinutes } from '@/lib/scheduleLogic';
import {
  appendFix,
  emptyDistanceAcc,
  loadDistanceAcc,
  saveDistanceAcc,
  tripStatsSnapshot,
  nearestBusesOnRoute,
} from '@/lib/activeTripStats';
import ActiveTripMap from '@/components/driver/ActiveTripMap';
import NearestBuses from '@/components/driver/NearestBuses';

const FALLBACK_SPEED_KMH = 20;
const NOW_TICK_MS = 15_000;
const VEHICLES_POLL_MS = 5_000;
const VEHICLES_POLL_MAX_MS = 30_000;
const NEAREST_LIMIT = 5;
/** Запись накопленных км в localStorage не чаще раза в 10 с. */
const DIST_SAVE_MS = 10_000;

function formatClock(ms) {
  if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 3600 * 1000) return '—';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Ближайшее время остановки не раньше now из stops_schedule (или null). */
function nextTimeForStop(schedule, stopIndex, now) {
  const entry = (schedule?.stops_schedule || []).find(
    (s) => Number(s?.stop_index) === stopIndex,
  );
  const times = (entry?.times || []).map(toMinutes).filter((m) => m !== null);
  if (!times.length) return null;
  const current = now.getHours() * 60 + now.getMinutes();
  const upcoming = times.filter((m) => m >= current);
  const minutes = upcoming.length ? Math.min(...upcoming) : null;
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
      <Icon size={16} className="mx-auto text-blue-500 mb-1" />
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-black text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

/**
 * Экран активного рейса водителя (ТЗ): карта рейса, текущая/следующая
 * остановки, последующие остановки, ближайшие машины (только живой GPS
 * других водителей на том же маршруте) и статистика рейса с кнопкой
 * завершения.
 */
export default function DriverActiveTrip() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { user, loading: loadingUser } = useCurrentUser();
  const { isTracking, gpsInfo, activeRoute, vehicleNumber, tripStartedAt, endTrip } = useTrip();

  const [now, setNow] = useState(() => Date.now());
  const [schedule, setSchedule] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [acc, setAcc] = useState(() => emptyDistanceAcc());
  const accRef = useRef(acc);
  const lastFixKeyRef = useRef(null);
  const lastSaveAtRef = useRef(0);
  const [ending, setEnding] = useState(false);

  // Экран и фоновые запросы — только для водителя на активном рейсе:
  // иначе не-водитель получал бы и заглушку «Нет доступа», и опрос vehicles.
  const canObserve = user?.role === 'driver'
    && user?.driver_status === 'approved'
    && isTracking
    && !!activeRoute?.id;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Расписание маршрута — времена отправления/прибытия остановок
  useEffect(() => {
    if (!canObserve) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await Schedule.filter({ route_id: activeRoute.id });
        if (!cancelled) setSchedule(rows?.[0] || null);
      } catch (e) {
        console.error('[DriverActiveTrip] расписание не загрузилось', e);
      }
    })();
    return () => { cancelled = true; };
  }, [canObserve, activeRoute?.id]);

  // Опрос машин своего маршрута: живой GPS других водителей
  useEffect(() => {
    if (!canObserve) return undefined;
    let cancelled = false;
    let retryDelay = VEHICLES_POLL_MS;
    let timer = null;

    const scheduleRetry = () => {
      if (!cancelled) timer = setTimeout(load, retryDelay);
    };

    const load = async () => {
      // офлайн — не стучимся, но держим цикл: по событию online обновимся сразу
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        scheduleRetry();
        return;
      }
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('*')
          .eq('route_id', activeRoute.id)
          .eq('is_active', true);
        if (cancelled) return;
        if (error || !data) {
          // supabase-js возвращает error, а не бросает — логируем и замедляемся
          console.warn('[DriverActiveTrip] опрос машин не удался', error?.message || 'нет данных');
          retryDelay = Math.min(retryDelay * 1.5, VEHICLES_POLL_MAX_MS);
        } else {
          setVehicles(data);
          retryDelay = VEHICLES_POLL_MS;
        }
      } catch (e) {
        if (cancelled) return;
        console.warn('[DriverActiveTrip] опрос машин упал', e?.message);
        retryDelay = Math.min(retryDelay * 1.5, VEHICLES_POLL_MAX_MS);
      }
      scheduleRetry();
    };

    const goRefresh = () => load();
    load();
    window.addEventListener('online', goRefresh);
    window.addEventListener('karta_vehicles_refresh', goRefresh);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', goRefresh);
      window.removeEventListener('karta_vehicles_refresh', goRefresh);
    };
  }, [canObserve, activeRoute?.id]);

  // Накопление км в пути по GPS-фиксам с персистом (переживает перезагрузку)
  useEffect(() => {
    const restored = loadDistanceAcc(tripStartedAt);
    setAcc(restored);
    accRef.current = restored;
    lastFixKeyRef.current = null;
    lastSaveAtRef.current = 0;
  }, [tripStartedAt]);

  useEffect(() => {
    if (!tripStartedAt || !isTracking) return;
    const lat = Number(gpsInfo?.lat);
    const lng = Number(gpsInfo?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (lastFixKeyRef.current === key) return;
    lastFixKeyRef.current = key;
    const next = appendFix(accRef.current, { lat, lng, ts: Date.now() });
    accRef.current = next;
    setAcc(next);
    // запись в localStorage троттлим: фиксы приходят каждые 1–5 с
    const ts = Date.now();
    if (ts - lastSaveAtRef.current >= DIST_SAVE_MS) {
      lastSaveAtRef.current = ts;
      saveDistanceAcc(next, tripStartedAt);
    }
  }, [gpsInfo?.lat, gpsInfo?.lng, tripStartedAt, isTracking]);

  const stops = useMemo(
    () => (Array.isArray(activeRoute?.stops)
      ? activeRoute.stops.filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng))
      : []),
    [activeRoute],
  );

  const hasGps = Number.isFinite(gpsInfo?.lat) && Number.isFinite(gpsInfo?.lng)
    && !(gpsInfo.lat === 0 && gpsInfo.lng === 0);

  const progress = useMemo(
    () => (hasGps && stops.length
      ? routeProgressByStops(stops, { lat: gpsInfo.lat, lng: gpsInfo.lng })
      : null),
    [hasGps, stops, gpsInfo?.lat, gpsInfo?.lng],
  );

  const speedKmh = Number.isFinite(gpsInfo?.speed) ? gpsInfo.speed : 0;
  const etaNext = progress
    ? estimateArrivalMinutes({
      distanceM: progress.distToNextM,
      speedKmh,
      lastUpdated: new Date(now).toISOString(),
      now,
      fallbackSpeedKmh: FALLBACK_SPEED_KMH,
    })
    : null;

  // Текущая остановка — последняя позади (или первая, если рейс ещё не начат)
  const currentIndex = progress
    ? (progress.nextStopIndex === null
      ? Math.max(0, stops.length - 1)
      : Math.max(0, progress.nextStopIndex - 1))
    : 0;
  const nextIndex = progress?.nextStopIndex ?? null;
  const departureTime = schedule ? nextTimeForStop(schedule, currentIndex, new Date(now)) : null;
  const nextArrivalTime = schedule && nextIndex !== null
    ? nextTimeForStop(schedule, nextIndex, new Date(now))
    : null;

  const upcomingStops = useMemo(() => {
    if (nextIndex === null) return [];
    return stops.slice(nextIndex + 1, nextIndex + 6).map((s, i) => ({
      index: nextIndex + 1 + i,
      name: s.name || `${nextIndex + 2 + i}`,
      time: schedule ? nextTimeForStop(schedule, nextIndex + 1 + i, new Date(now)) : null,
    }));
    // nextTimeForStop зависит от now — пересчитываем на тике
  }, [stops, nextIndex, schedule, Math.floor(now / 60000)]);

  const nearest = useMemo(() => nearestBusesOnRoute({
    vehicles,
    routeId: activeRoute?.id,
    selfDriverId: user?.id,
    selfVehicleNumber: vehicleNumber,
    origin: hasGps ? { lat: gpsInfo.lat, lng: gpsInfo.lng } : null,
    now,
    fallbackSpeedKmh: FALLBACK_SPEED_KMH,
    limit: NEAREST_LIMIT,
  }), [vehicles, activeRoute?.id, user?.id, vehicleNumber, hasGps, gpsInfo?.lat, gpsInfo?.lng, now]);

  const stats = tripStatsSnapshot({
    acc,
    tripStartedAt,
    now,
    stopsTotal: stops.length,
    passedCount: progress?.passedCount ?? 0,
    speedKmh,
  });

  const handleEndTrip = async () => {
    if (ending) return; // двойной тап не должен вызывать endTrip дважды
    setEnding(true);
    try {
      await endTrip();
      navigate('/driver-schedule');
    } catch (e) {
      console.error('[DriverActiveTrip] не удалось завершить рейс', e);
      setEnding(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-full" role="status" aria-live="polite">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <span className="sr-only">{t('loading')}</span>
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

  if (!isTracking || !activeRoute) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
        <Bus size={48} className="text-blue-300" />
        <p className="text-slate-600 font-medium">{t('schedule.noActiveTrip')}</p>
        <Link
          to="/driver-schedule"
          className="min-h-[44px] px-5 inline-flex items-center rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
        >
          {t('nav.schedule')}
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-6">
        <header className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-4 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur shrink-0">
              <Bus size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">
                #{activeRoute.number} {activeRoute.name || ''}
              </p>
              <p className="text-[11px] text-blue-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                {t('activeTrip.inProgress')} · {vehicleNumber || '—'}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-black leading-none">{speedKmh}</p>
            <p className="text-[10px] text-blue-200">{t('speedUnit')}</p>
          </div>
        </header>

        <div className="h-56" data-testid="active-trip-map">
          <ActiveTripMap route={activeRoute} position={hasGps ? gpsInfo : null} buses={nearest} lang={lang} />
        </div>

        {/* Текущая остановка и время отправления */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <MapPin size={12} className="text-emerald-500" />
                {t('activeTrip.currentStop')}
              </p>
              <p className="text-sm font-extrabold text-slate-900 truncate mt-0.5" data-testid="current-stop">
                {stops[currentIndex]?.name || '—'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-end gap-1">
                <Clock size={12} className="text-blue-500" />
                {t('activeTrip.departure')}
              </p>
              <p className="text-sm font-extrabold text-slate-900" data-testid="departure-time">
                {departureTime || '—'}
              </p>
            </div>
          </div>
        </section>

        {/* Следующая остановка: расстояние и время прибытия */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Navigation size={12} className="text-blue-500" />
                {t('activeTrip.nextStop')}
              </p>
              <p className="text-sm font-extrabold text-slate-900 truncate mt-0.5" data-testid="next-stop">
                {progress?.nextStop?.name || t('trip.atTerminal')}
              </p>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <p className="text-sm font-black text-blue-600" data-testid="next-stop-dist">
                {progress ? formatDistanceM(progress.distToNextM, lang) : '—'}
              </p>
              <p className="text-[11px] font-bold text-slate-500" data-testid="next-stop-eta">
                {nextArrivalTime
                  || (etaNext !== null ? `≈${etaNext} ${t('minutes')}` : t('busmap.etaUnknown'))}
              </p>
            </div>
          </div>
        </section>

        {/* Последующие остановки маршрута */}
        {upcomingStops.length > 0 && (
          <section className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
            <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              {t('activeTrip.upcomingStops')}
            </h3>
            <ul className="space-y-1.5">
              {upcomingStops.map((stop) => (
                <li
                  key={stop.index}
                  className="flex items-center justify-between gap-2 text-xs border-b border-slate-50 last:border-0 pb-1.5 last:pb-0"
                >
                  <span className="font-bold text-slate-700 truncate">{stop.name}</span>
                  <span className="font-black text-slate-500 shrink-0">{stop.time || '—'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <NearestBuses buses={nearest} />

        {/* Статистика рейса */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Gauge size={12} className="text-blue-500" />
            {t('activeTrip.stats')}
          </h3>
          <div className="grid grid-cols-2 gap-2" data-testid="trip-stats">
            <StatTile
              icon={Navigation}
              label={t('activeTrip.km')}
              value={`${stats.km.toFixed(1)} ${t('activeTrip.kmUnit')}`}
            />
            <StatTile
              icon={Clock}
              label={t('activeTrip.duration')}
              value={tripStartedAt ? formatClock(now - tripStartedAt) : '—'}
            />
            <StatTile
              icon={CheckCircle2}
              label={t('activeTrip.stops')}
              value={`${stats.stopsPassed} / ${stats.stopsTotal}`}
            />
            <StatTile
              icon={Gauge}
              label={t('driver.speedLabel')}
              value={`${stats.speedKmh} ${t('speedUnit')}`}
            />
          </div>
        </section>

        <button
          type="button"
          onClick={handleEndTrip}
          disabled={ending}
          data-testid="end-trip"
          className="w-full min-h-[44px] py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors active:scale-95"
        >
          <Square size={14} />
          {t('activeTrip.endTrip')}
        </button>
      </div>
    </div>
  );
}
