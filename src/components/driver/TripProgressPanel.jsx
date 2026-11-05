import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MapPin, Navigation, Clock, CheckCircle2, LogOut } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { haversineM } from '@/lib/geo';
import {
  routeProgressByStops,
  nextStopStateMachine,
  estimateArrivalMinutes,
  formatDistanceM,
  gpsFreshness,
  STOP_CONFIRM_FIXES,
} from '@/lib/trackingLogic';

// Средняя городская скорость — только для явной подсказки «примерно»,
// когда транспорт стоит (светофор, посадка). Не подменяет реальные данные:
// при движении ETA считается по текущей скорости GPS.
const FALLBACK_SPEED_KMH = 20;
const NOW_TICK_MS = 15000; // перерисовка: длительность рейса и свежесть GPS

function Row({ label, value, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={`text-xs ${strong ? 'font-extrabold text-slate-900 dark:text-white' : 'font-bold text-slate-700 dark:text-slate-200'} text-right`}>
        {value}
      </span>
    </div>
  );
}

function etaLabel(minutes, t) {
  if (minutes === null) return t('busmap.etaUnknown');
  return `${t('busmap.etaApprox')} ${minutes} ${t('minutes')}`;
}

/** Побайтовое сравнение состояния машины остановки (для guard в setMachine). */
function sameMachine(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.phase === b.phase
    && a.stopIndex === b.stopIndex
    && a.fixes === b.fixes
    && a.arrivedAt === b.arrivedAt
    && a.dwellStart === b.dwellStart
    && a.dwellMs === b.dwellMs;
}

function formatClock(ms) {
  // сессия могла упасть без endTrip — длительность «480:00» не показываем
  if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 3600 * 1000) return '—';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

const PHASE_META = {
  pending: { key: 'trip.phasePending', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  arriving: { key: 'trip.phaseArriving', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  dwelling: { key: 'trip.phaseDwelling', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  departed: { key: 'trip.phaseDeparted', color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' },
};

/**
 * Панель активного рейса водителя (п. 4–5 ТЗ):
 * следующая остановка, расстояния ВДОЛЬ маршрута, ETA, пройдено/всего,
 * длительность, автофиксация прибытия/стоянки/отправления (машина состояний
 * с подтверждением по 2 GPS-замерам) и ручное подтверждение — только для
 * текущей остановки, без возможности пропустить этапы.
 */
export default function TripProgressPanel({ route, gpsInfo, tripStartedAt }) {
  const { t, lang } = useLanguage();

  const stops = useMemo(
    () => (Array.isArray(route?.stops)
      ? route.stops.filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng) && !(s.lat === 0 && s.lng === 0))
      : []),
    [route],
  );

  const hasGps = Number.isFinite(gpsInfo?.lat) && Number.isFinite(gpsInfo?.lng)
    && !(gpsInfo.lat === 0 && gpsInfo.lng === 0);

  const progress = useMemo(
    () => (hasGps && stops.length
      ? routeProgressByStops(stops, { lat: gpsInfo.lat, lng: gpsInfo.lng })
      : null),
    [hasGps, stops, gpsInfo?.lat, gpsInfo?.lng],
  );

  const nextIndex = progress?.nextStopIndex ?? null;

  // Время последнего GPS-фикса на клиенте: по нему считаем свежесть и ETA.
  // До первого фикса панель честно показывает «неизвестно».
  const lastFixAtRef = useRef(null);
  const machineRef = useRef(null);
  const servingRef = useRef(null); // индекс обслуживаемой остановки
  // Ключ последнего GPS-фикса, обработанного машиной: без него эффект
  // продвигал бы состояния на каждом перерендере (смена идентичности
  // колбэков) и «расходовал» подряд-замеры без реального нового замера.
  const fedFixRef = useRef(null);
  const [machine, setMachine] = useState(null);
  const [log, setLog] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (hasGps) lastFixAtRef.current = Date.now();
  }, [hasGps, gpsInfo?.lat, gpsInfo?.lng]);

  const recordArrival = useCallback((index, at) => {
    const name = stops[index]?.name || `${index + 1}`;
    setLog((prev) => (prev.some((x) => x.index === index)
      ? prev
      : [...prev, { index, name, arrivedAt: at, departedAt: null, dwellMs: null }]));
    toast.success(`${t('trip.autoArrived')}: ${name}`);
  }, [stops, t]);

  const recordDeparture = useCallback((index, at, dwellMs) => {
    const name = stops[index]?.name || `${index + 1}`;
    setLog((prev) => prev.map((x) => (x.index === index
      ? { ...x, departedAt: at, dwellMs: dwellMs ?? null }
      : x)));
    toast.success(`${t('trip.autoDeparted')}: ${name}`);
  }, [stops, t]);

  // Машина состояний остановки: продвигается только по реальным GPS-замерам.
  // Обслуживаемая остановка (serving) не «перепрыгивает»: она меняется лишь
  // после отправления или при явном GPS-прыжке вперёд — пропуск этапов
  // невозможен, а каждый этап закрывается событием.
  useEffect(() => {
    if (!progress) {
      machineRef.current = null;
      servingRef.current = null;
      fedFixRef.current = null;
      setMachine(null);
      return;
    }

    // Один GPS-фикс — одна итерация машины. Повторные запуски эффекта
    // из-за нестабильных зависимостей не должны накапливать fixes.
    const fixKey = `${gpsInfo.lat}|${gpsInfo.lng}|${gpsInfo.speed ?? 0}`;
    if (fedFixRef.current === fixKey) return;
    fedFixRef.current = fixKey;

    let serving = servingRef.current;
    if (serving === null || serving === undefined) serving = nextIndex;
    if (serving === null) return; // на конечной обслуживать некого
    const servingStop = stops[serving] || null;

    // GPS-прыжок вперёд: проекция миновала обслуживаемую остановку, но этап
    // не закрыт (машина в покое) — переносим обслуживание на остановку вперёд.
    if (nextIndex !== null && nextIndex > serving) {
      const phase0 = machineRef.current?.phase;
      const fixes0 = machineRef.current?.fixes ?? 0;
      if (!machineRef.current || phase0 === 'departed' || (phase0 === 'pending' && fixes0 === 0)) {
        serving = nextIndex;
      }
    }

    const res = nextStopStateMachine(machineRef.current, {
      // Дистанция именно к обслуживаемой остановке, а не к progress.nextStop:
      // сразу после отправления проекция ещё «у» старой остановки, и кормить
      // машину её нулевой дистанцией — ложное прибытие на следующую (MAJOR).
      distToNextM: servingStop
        ? haversineM(gpsInfo.lat, gpsInfo.lng, servingStop.lat, servingStop.lng)
        : progress.distToNextM,
      speedKmh: gpsInfo?.speed ?? 0,
      now: Date.now(),
      stopIndex: serving,
    });
    machineRef.current = res.state;
    // Безопасность от цикла рендера: эффект может перезапускаться из-за
    // нестабильных зависимостей (например, t меняет идентичность) — стейт
    // ставим только при реальном изменении состояния машины.
    setMachine((prev) => (sameMachine(prev, res.state) ? prev : res.state));

    if (res.event === 'arriving') {
      recordArrival(serving, res.state.arrivedAt ?? Date.now());
      servingRef.current = serving;
    } else if (res.event === 'departed') {
      recordDeparture(serving, Date.now(), res.state.dwellMs);
      // Этап закрыт — дальше только вперёд: следующая остановка впереди
      // по проекции, иначе просто соседняя по цепочке.
      servingRef.current = (nextIndex !== null && nextIndex > serving)
        ? nextIndex
        : Math.min(serving + 1, stops.length - 1);
    } else {
      servingRef.current = serving;
    }
  }, [progress, gpsInfo?.speed, nextIndex, recordArrival, recordDeparture, stops.length]);

  // Ручное подтверждение — только для текущей остановки и только свой этап:
  // прибытие нельзя подтвердить дважды, отправление — до прибытия.
  // Источник истины — machine.stopIndex (закоммиченное состояние), а не ref.
  const handleConfirmArrival = () => {
    if (!machine || machine.phase !== 'pending') return;
    const index = machine.stopIndex;
    if (index === null || index === undefined) return;
    const at = Date.now();
    const next = { ...machine, phase: 'arriving', arrivedAt: at, fixes: STOP_CONFIRM_FIXES };
    machineRef.current = next;
    setMachine(next);
    recordArrival(index, at);
  };

  const handleConfirmDeparture = () => {
    if (!machine || (machine.phase !== 'arriving' && machine.phase !== 'dwelling')) return;
    const index = machine.stopIndex;
    if (index === null || index === undefined) return;
    const at = Date.now();
    const dwellMs = machine.dwellStart != null ? Math.max(0, at - machine.dwellStart) : null;
    const next = { ...machine, phase: 'departed', dwellMs };
    machineRef.current = next;
    setMachine(next);
    recordDeparture(index, at, dwellMs);
    // Как и в авто-режиме: этап закрыт, обслуживание уходит только вперёд.
    servingRef.current = (nextIndex !== null && nextIndex > index)
      ? nextIndex
      : Math.min(index + 1, stops.length - 1);
  };

  const lastFixAt = lastFixAtRef.current;
  const freshness = lastFixAt ? gpsFreshness(new Date(lastFixAt).toISOString(), now) : 'unknown';
  const gpsLost = freshness !== 'fresh' && freshness !== 'aging';

  const speedKmh = Number.isFinite(gpsInfo?.speed) ? gpsInfo.speed : 0;
  const etaNext = progress
    ? estimateArrivalMinutes({
      distanceM: progress.distToNextM,
      speedKmh,
      lastUpdated: lastFixAt ? new Date(lastFixAt).toISOString() : null,
      now,
      fallbackSpeedKmh: FALLBACK_SPEED_KMH,
    })
    : null;
  const etaEnd = progress
    ? estimateArrivalMinutes({
      distanceM: progress.remainingM,
      speedKmh,
      lastUpdated: lastFixAt ? new Date(lastFixAt).toISOString() : null,
      now,
      fallbackSpeedKmh: FALLBACK_SPEED_KMH,
    })
    : null;

  const phase = machine?.phase || 'pending';
  const phaseMeta = PHASE_META[phase] || PHASE_META.pending;
  // Отображение — из закоммиченного machine.stopIndex, не из ref (ref отстаёт
  // на один коммит и читать его во время рендера нельзя).
  const servingIndex = machine?.stopIndex ?? nextIndex;
  const servingName = stops[servingIndex]?.name || null;

  if (!route) return null;

  if (!stops.length) {
    return (
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-5 border border-slate-200/60 dark:border-slate-800/80 shadow-md text-xs font-bold text-slate-400">
        {t('trip.noStops')}
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-5 border border-slate-200/60 dark:border-slate-800/80 shadow-md flex items-center gap-3">
        <Navigation size={16} className="text-emerald-500 animate-pulse" />
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('trip.waitingGps')}</span>
      </div>
    );
  }

  return (
    <section
      data-testid="trip-progress"
      className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl p-5 border border-slate-200/60 dark:border-slate-800/80 shadow-xl space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <MapPin size={12} /> {t('trip.nextStop')}
          </div>
          <div data-testid="trip-next-stop" className="text-base font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
            {progress.nextStop?.name || t('trip.atTerminal')}
          </div>
        </div>
        <span data-testid="trip-phase" className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider shrink-0 ${phaseMeta.color}`}>
          {t(phaseMeta.key)}
        </span>
      </div>

      {gpsLost && (
        <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-xl px-3 py-2">
          ⚠ {t('busmap.statusStale')} — {t('busmap.etaUnknown')}
        </div>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row label={t('trip.toStop')} value={formatDistanceM(progress.distToNextM, lang)} strong />
        <Row label={t('trip.etaToStop')} value={etaLabel(etaNext, t)} strong />
        <Row label={t('trip.toEnd')} value={formatDistanceM(progress.remainingM, lang)} />
        <Row label={t('trip.etaToEnd')} value={etaLabel(etaEnd, t)} />
        <Row
          label={t('trip.passed')}
          value={t('trip.stopsOf', { passed: progress.passedCount, total: stops.length })}
        />
        <Row
          label={t('trip.duration')}
          value={<span className="inline-flex items-center gap-1"><Clock size={12} />{tripStartedAt ? formatClock(now - tripStartedAt) : '—'}</span>}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirmArrival}
          disabled={machine?.phase !== 'pending'}
          className="flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          <CheckCircle2 size={14} /> {t('trip.confirmArrival')}
        </button>
        <button
          type="button"
          onClick={handleConfirmDeparture}
          disabled={machine?.phase !== 'arriving' && machine?.phase !== 'dwelling'}
          className="flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          <LogOut size={14} /> {t('trip.confirmDeparture')}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 font-bold -mt-1">
        {t('trip.manualHint')}{servingName ? ` — ${servingName}` : ''}
      </p>

      {log.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
          <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{t('trip.logTitle')}</div>
          {log.slice(-4).map((entry) => (
            <div key={entry.index} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-600 dark:text-slate-300 truncate">{entry.index + 1}. {entry.name}</span>
              <span className="text-slate-400 font-bold shrink-0">
                {entry.departedAt
                  ? `${t('trip.departedAt')} ${new Date(entry.departedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    + (entry.dwellMs != null ? ` · ${t('trip.dwell')} ${Math.max(1, Math.round(entry.dwellMs / 1000))} ${t('trip.sec')}` : '')
                  : `${t('trip.arrivedAt')} ${new Date(entry.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        to={`/?route=${route.id}`}
        className="block w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center gap-2 hover:bg-slate-700 transition-all active:scale-95"
      >
        <MapPin size={14} /> {t('trip.openMap')}
      </Link>
    </section>
  );
}
