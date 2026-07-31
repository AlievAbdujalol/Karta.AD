import { useState } from 'react';
import { Phone, MessageCircle, Navigation, AlertTriangle, CheckCircle, MapPin, Banknote, CreditCard, QrCode, Star, Wallet } from 'lucide-react';
import { formatTJS, TAXI_COMMISSION, tariffById } from '@/lib/taxi';

const STATUS_CONFIG = {
  found: { label: 'Едем к пассажиру', color: 'from-blue-500 to-blue-600', ringColor: 'ring-blue-200 dark:ring-blue-900', emoji: '🟡' },
  arrived: { label: 'Вы прибыли', color: 'from-amber-500 to-amber-600', ringColor: 'ring-amber-200 dark:ring-amber-900', emoji: '🔵' },
  riding: { label: 'Клиент в машине', color: 'from-indigo-500 to-indigo-600', ringColor: 'ring-indigo-200 dark:ring-indigo-900', emoji: '🟣' },
};

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Наличные', icon: Banknote },
  { id: 'card', label: 'Карта', icon: CreditCard },
  { id: 'qr', label: 'QR', icon: QrCode },
];

export default function TaxiOrderCard({ order, passengerInfo, phase = 'active', onAction, onPaid, onRated, onSos, onChat, onShare, unread = 0 }) {
  const [method, setMethod] = useState('cash');
  const [clientStars, setClientStars] = useState(0);

  if (!order) return null;
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.found;
  const tariff = tariffById(order.category);
  const amount = Number(order.price) || 0;
  const commission = Math.round(amount * TAXI_COMMISSION * 100) / 100;
  const earnings = Math.round((amount - commission) * 100) / 100;

  return (
    <div className="absolute bottom-16 left-0 right-0 z-40 animate-slide-up">
      <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-700/60 max-h-[60vh] overflow-y-auto custom-scrollbar">
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
                <p className="text-white/70 text-[10px]">{config.emoji} {config.label}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white font-black text-lg">{formatTJS(order.price)}</p>
              <p className="text-white/60 text-[10px]">TJS · {tariff.short}</p>
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
              <div className="text-right text-[10px] text-slate-400 shrink-0">
                {order.distance_km != null && <p>{Number(order.distance_km).toFixed(1)} км</p>}
                {order.duration_min != null && <p>~{order.duration_min} мин</p>}
              </div>
            </div>
          </div>

          {/* PAYMENT PHASE */}
          {phase === 'payment' && (
            <div className="space-y-3">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 text-xs">Стоимость поездки</span>
                  <span className="font-black text-lg text-emerald-600">{formatTJS(amount)} TJS</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Комиссия сервиса ({(TAXI_COMMISSION * 100).toFixed(0)}%)</span>
                  <span>-{formatTJS(commission)} TJS</span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>К выплате водителю</span>
                  <span className="text-emerald-600">{formatTJS(earnings)} TJS</span>
                </div>
              </div>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map(m => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMethod(m.id)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-[11px] font-bold transition-all ${
                        method === m.id
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <Icon size={16} /> {m.label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => onPaid(method)}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-black text-sm shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Wallet size={16} />
                Получить оплату · {formatTJS(earnings)} TJS
              </button>
            </div>
          )}

          {/* RATE CLIENT PHASE */}
          {phase === 'rate' && (
            <div className="space-y-3 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-bold">Оплата получена!</p>
                <p className="text-xs text-slate-400 mt-0.5">Оцените клиента</p>
              </div>
              <div className="flex justify-center gap-1">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => setClientStars(s)} className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${clientStars >= s ? 'bg-amber-100 text-amber-500 scale-110' : 'bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-500'}`}>
                    <Star size={20} fill={clientStars >= s ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <button
                onClick={() => onRated(clientStars)}
                disabled={!clientStars}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${
                  clientStars ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25 active:scale-[0.98]' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                Завершить поездку
              </button>
            </div>
          )}

          {/* ACTIVE PHASE */}
          {phase === 'active' && (
            <>
              {/* Contact buttons */}
              {order.status !== 'riding' && (
                <div className="flex gap-2">
                  {passengerInfo?.phone && (
                    <a
                      href={`tel:${passengerInfo.phone}`}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                    >
                      <Phone size={14} />
                      Позвонить
                    </a>
                  )}
                  <button onClick={onChat} className={`${passengerInfo?.phone ? 'flex-1' : 'w-full'} py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors relative`}>
                    <MessageCircle size={14} />
                    Чат
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </button>
                </div>
              )}

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
                <div className="space-y-2">
                  <button
                    onClick={() => onAction('riding')}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Navigation size={16} />
                    Начать поездку
                  </button>
                  <button onClick={() => onAction('cancelled')} className="w-full py-2 text-red-500 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors">
                    Отменить
                  </button>
                </div>
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
                    <button onClick={onSos} className="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center gap-1.5 text-xs font-bold text-red-500 hover:bg-red-100 transition-colors">
                      <AlertTriangle size={14} />
                      SOS
                    </button>
                    <button
                      onClick={onShare}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                    >
                      <MapPin size={14} />
                      Поделиться
                    </button>
                  </div>
                  <button onClick={() => onAction('cancelled')} className="w-full py-2 text-red-500 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors">
                    Отменить поездку
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
