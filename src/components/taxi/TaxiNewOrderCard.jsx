import { useState, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { formatTJS, tariffById, demandLabel } from '@/lib/taxi';

const TIMER_SECONDS = 20;

export default function TaxiNewOrderCard({ order, onAccept, onReject }) {
  const [timer, setTimer] = useState(TIMER_SECONDS);

  useEffect(() => {
    if (timer <= 0) {
      onReject();
      return;
    }
    const t = setTimeout(() => setTimer((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [timer, onReject]);

  const handleAccept = useCallback(() => {
    onAccept(order);
  }, [order, onAccept]);
  const handleReject = useCallback(() => {
    onReject();
  }, [onReject]);

  const tariff = tariffById(order.category);
  const price = Number(order.price) || null;
  const demand = demandLabel(order.demand_coef || 1);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 px-3 pb-2 md:mx-auto md:max-w-md">
      <div className="pointer-events-auto animate-slide-up overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_8px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/95">
        <div className="h-1 bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
            style={{ width: `${(timer / TIMER_SECONDS) * 100}%` }}
          />
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Новый заказ</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {tariff.short}
              </span>
              {(Number(order.demand_coef) || 1) > 1 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${demand.tone}`}>{demand.badge}</span>
              )}
            </div>
            <span className={`text-sm font-black tabular-nums ${timer <= 5 ? 'text-red-500' : 'text-slate-500'}`}>{timer}с</span>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="my-0.5 h-8 w-px bg-slate-200 dark:bg-slate-700" />
              <span className="h-2 w-2 rounded-full bg-red-500" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                {order.pickup_address || 'Подача'}
              </p>
              <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                {order.dropoff_address || 'Назначение'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-black leading-none text-slate-900 dark:text-white">
                {price != null ? formatTJS(price) : '—'}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">TJS</p>
              {order.distance_km != null && (
                <p className="text-[10px] text-slate-400">{Number(order.distance_km).toFixed(1)} км</p>
              )}
            </div>
          </div>

          {order.comment && (
            <p className="truncate rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800/70">
              {order.comment}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReject}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800"
              aria-label="Отклонить"
            >
              <X size={20} />
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-bold text-white active:scale-[0.98]"
            >
              <Check size={18} strokeWidth={2.5} />
              Принять{price != null ? ` · ${formatTJS(price)}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
