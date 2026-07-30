import { useState, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';

const CATEGORY_LABELS = { economy: 'Эконом', comfort: 'Комфорт', comfort_plus: 'Комфорт+', minivan: 'Минивэн', business: 'Бизнес' };
const TIMER_SECONDS = 15;

export default function TaxiNewOrderCard({ order, onAccept, onReject }) {
  const [timer, setTimer] = useState(TIMER_SECONDS);

  useEffect(() => {
    if (timer <= 0) { onReject(); return; }
    const t = setTimeout(() => setTimer(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [timer, onReject]);

  const handleAccept = useCallback(() => { onAccept(order); }, [order, onAccept]);
  const handleReject = useCallback(() => { onReject(); }, [onReject]);

  const distance = order.distance || '—';
  const eta = order.eta || '—';
  const price = order.price || '—';
  const pickupTime = order.pickup_time || '—';

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-700/60">
        {/* Timer bar */}
        <div className="px-5 pt-3">
          <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(timer / TIMER_SECONDS) * 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Новый заказ</span>
            <span className={`text-xs font-black ${timer <= 5 ? 'text-red-500 animate-pulse' : 'text-blue-500'}`}>
              {timer}с
            </span>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Route info */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-green-200 dark:ring-green-900" />
              <div className="w-0.5 h-8 bg-gradient-to-b from-green-400 to-red-400 rounded-full" />
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-200 dark:ring-red-900" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Подача</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5">{order.pickup_address || 'Не указан'}</p>
              </div>
              {order.dropoff_address && (
                <div>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Назначение</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5">{order.dropoff_address}</p>
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Расст.', value: distance, icon: '📏' },
              { label: 'Подача', value: pickupTime, icon: '🕒' },
              { label: 'Стоим.', value: price ? `${price} TJS` : '—', icon: '💰' },
              { label: 'Категория', value: CATEGORY_LABELS[order.category] || 'Эконом', icon: '🚗' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl py-2 px-1">
                <p className="text-sm mb-0.5">{icon}</p>
                <p className="text-[10px] font-black text-slate-800 dark:text-slate-100 leading-tight">{value}</p>
                <p className="text-[8px] text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Comment */}
          {order.comment && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
              <p className="text-[10px] text-amber-600 dark:text-amber-400">{order.comment}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-[0.97]"
            >
              <X size={18} />
              Отказ
            </button>
            <button
              onClick={handleAccept}
              className="flex-[2] py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all active:scale-[0.97]"
            >
              <Check size={18} strokeWidth={3} />
              Принять · {price ? `${price} TJS` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
