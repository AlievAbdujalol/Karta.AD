import { useNavigation } from '@/lib/NavigationContext';
import { X, Clock, Route, Gauge, CreditCard } from 'lucide-react';

function formatDur(s) {
  if (!s) return '0 мин';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function formatDist(m) {
  if (!m) return '0 м';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} км`;
  return `${Math.round(m)} м`;
}

export default function TripSummary() {
  const { showSummary, summaryData, closeSummary } = useNavigation();

  if (!showSummary || !summaryData) return null;

  return (
    <div className="absolute inset-0 z-[900] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
      <div className="mx-4 w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="relative px-6 pt-8 pb-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-center">
          <button
            onClick={closeSummary}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <X size={16} className="text-white" />
          </button>
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">🏁</span>
          </div>
          <h2 className="text-xl font-extrabold text-white">Поездка завершена</h2>
          {summaryData.fromName && summaryData.toName && (
            <p className="text-emerald-100 text-xs mt-1.5 truncate max-w-[250px] mx-auto">
              {summaryData.fromName} → {summaryData.toName}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <Clock size={18} className="text-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 uppercase">Время в пути</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatDur(summaryData.duration)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <Route size={18} className="text-emerald-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 uppercase">Расстояние</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatDist(summaryData.distance)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <Gauge size={18} className="text-violet-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 uppercase">Средняя скорость</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{Math.round(summaryData.avgSpeed)} км/ч</p>
            </div>
          </div>

          {summaryData.cost > 0 && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
              <CreditCard size={18} className="text-amber-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-400 uppercase">Стоимость</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{summaryData.cost} TJS</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-2">
          <button
            onClick={closeSummary}
            className="w-full py-3 rounded-xl font-bold text-sm bg-slate-900 dark:bg-white dark:text-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
