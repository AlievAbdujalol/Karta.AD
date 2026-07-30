import { Phone, MessageCircle, Navigation, AlertTriangle, CheckCircle, MapPin } from 'lucide-react';

const STATUS_CONFIG = {
  found: { label: 'Едем к пассажиру', color: 'from-blue-500 to-blue-600', ringColor: 'ring-blue-200 dark:ring-blue-900' },
  arrived: { label: 'Вы прибыли', color: 'from-amber-500 to-amber-600', ringColor: 'ring-amber-200 dark:ring-amber-900' },
  riding: { label: 'В пути', color: 'from-indigo-500 to-indigo-600', ringColor: 'ring-indigo-200 dark:ring-indigo-900' },
};

export default function TaxiOrderCard({ order, passengerInfo, onAction }) {
  if (!order) return null;
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.found;

  return (
    <div className="absolute bottom-16 left-0 right-0 z-40 animate-slide-up">
      <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-700/60">
        <div className="px-5 pt-4 pb-5 space-y-4">
          {/* Status banner */}
          <div className={`bg-gradient-to-r ${config.color} rounded-2xl p-4 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full bg-white/20 ring-2 ${config.ringColor} flex items-center justify-center overflow-hidden`}>
                {passengerInfo?.photo_url ? (
                  <img src={passengerInfo.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-lg">{passengerInfo?.full_name?.[0] || '?'}</span>
                )}
              </div>
              <div>
                <p className="text-white font-bold text-sm">{passengerInfo?.full_name || 'Пассажир'}</p>
                <p className="text-white/70 text-[10px]">{config.label}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white font-black text-lg">{order.price || '—'}</p>
              <p className="text-white/60 text-[10px]">TJS</p>
            </div>
          </div>

          {/* Route */}
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-0.5 pt-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <div className="w-0.5 h-6 bg-slate-200 dark:bg-slate-700 rounded-full" />
                <div className="w-2 h-2 rounded-full bg-red-500" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-medium">Подача</p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{order.pickup_address || 'Не указан'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-medium">Назначение</p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{order.dropoff_address || 'Не указан'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact buttons */}
          {passengerInfo?.phone && order.status !== 'arrived' && (
            <div className="flex gap-2">
              <a
                href={`tel:${passengerInfo.phone}`}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
              >
                <Phone size={14} />
                Позвонить
              </a>
              <button className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors">
                <MessageCircle size={14} />
                Чат
              </button>
            </div>
          )}

          {/* Action buttons */}
          {order.status === 'found' && (
            <div className="space-y-2">
              <button
                onClick={() => onAction('arrived')}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all"
              >
                Прибыл к пассажиру
              </button>
              <button onClick={() => onAction('cancelled')} className="w-full py-2 text-red-500 text-xs font-bold">Отменить</button>
            </div>
          )}

          {order.status === 'arrived' && (
            <button
              onClick={() => onAction('riding')}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Navigation size={16} />
              Начать поездку
            </button>
          )}

          {order.status === 'riding' && (
            <div className="space-y-2">
              <button
                onClick={() => onAction('completed')}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all"
              >
                Завершить поездку
              </button>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center gap-1.5 text-xs font-bold text-red-500 hover:bg-red-100 transition-colors">
                  <AlertTriangle size={14} />
                  SOS
                </button>
                <button
                  onClick={() => navigate('/taxi/history')}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                >
                  <MapPin size={14} />
                  Поделиться
                </button>
              </div>
            </div>
          )}

          {order.status === 'completed' && (
            <div className="text-center space-y-3 py-2">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Поездка завершена</p>
                <p className="text-xs text-slate-400 mt-1">{order.price || '—'} TJS · {order.distance || '—'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
