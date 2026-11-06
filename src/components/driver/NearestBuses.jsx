import { Bus, Navigation } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { formatDistanceM } from '@/lib/trackingLogic';

/**
 * Список «Ближайшие машины»: только реальные GPS других водителей на том же
 * маршруте (уже отфильтрованы в nearestBusesOnRoute). Без живых данных —
 * честное пустое состояние, без выдуманных номеров и расстояний.
 */
export default function NearestBuses({ buses = [] }) {
  const { t, lang } = useLanguage();

  if (!buses.length) {
    return (
      <div
        data-testid="nearest-buses-empty"
        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center space-y-1.5"
      >
        <Bus size={26} className="mx-auto text-slate-300" />
        <p className="text-xs font-bold text-slate-500">{t('activeTrip.noBuses')}</p>
        <p className="text-[11px] text-slate-400">{t('activeTrip.noBusesHint')}</p>
      </div>
    );
  }

  return (
    <section
      data-testid="nearest-buses"
      className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3"
    >
      <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Bus size={13} className="text-blue-500" />
        {t('activeTrip.nearestBuses')}
      </h3>
      <ul className="space-y-2">
        {buses.map((bus) => (
          <li
            key={bus.id}
            data-testid={`nearest-bus-${bus.id}`}
            className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">
                {bus.vehicleNumber || '—'}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {bus.driverName || t('activeTrip.busDriver')}
                </p>
                <p className="text-[11px] text-slate-400 font-bold">
                  {formatDistanceM(bus.distanceM, lang)}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-black text-slate-600 flex items-center gap-1 shrink-0">
              <Navigation size={12} className="text-blue-500" />
              {bus.etaMinutes === null || bus.etaMinutes === undefined
                ? t('busmap.etaUnknown')
                : `≈${bus.etaMinutes} ${t('minutes')}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
