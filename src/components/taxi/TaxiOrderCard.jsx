import { useState } from 'react';
import { Phone, MessageCircle, Navigation, AlertTriangle, CheckCircle, Share2, Banknote, CreditCard, QrCode, Star, Wallet } from 'lucide-react';
import { formatTJS, TAXI_COMMISSION, tariffById } from '@/lib/taxi';

const STATUS_CONFIG = {
  found: { label: 'К пассажиру', tone: 'text-blue-600 dark:text-blue-400' },
  arrived: { label: 'На месте', tone: 'text-amber-600 dark:text-amber-400' },
  riding: { label: 'В поездке', tone: 'text-indigo-600 dark:text-indigo-400' },
};

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Нал.', icon: Banknote },
  { id: 'card', label: 'Карта', icon: CreditCard },
  { id: 'qr', label: 'QR', icon: QrCode },
  { id: 'wallet', label: 'Кошелёк', icon: Wallet },
];

export default function TaxiOrderCard({
  order, passengerInfo, phase = 'active', onAction, onPaid, onRated, onSos, onChat, onShare, unread = 0,
}) {
  const [method, setMethod] = useState('cash');
  const [clientStars, setClientStars] = useState(0);

  if (!order) return null;
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.found;
  const tariff = tariffById(order.category);
  const amount = Number(order.price) || 0;
  const commission = Math.round(amount * TAXI_COMMISSION * 100) / 100;
  const earnings = Math.round((amount - commission) * 100) / 100;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3 pb-2 md:mx-auto md:max-w-md">
      <div className="pointer-events-auto animate-slide-up max-h-[52vh] overflow-y-auto rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_8px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl custom-scrollbar dark:border-slate-700/60 dark:bg-slate-950/95">
        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-bold dark:bg-slate-700">
              {passengerInfo?.photo_url ? (
                <img src={passengerInfo.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                passengerInfo?.full_name?.[0] || '?'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                {passengerInfo?.full_name || 'Пассажир'}
              </p>
              <p className={`text-[11px] font-medium ${config.tone}`}>{config.label} · {tariff.short}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black leading-none">{formatTJS(order.price)}</p>
              <p className="text-[10px] text-slate-400">TJS</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="my-0.5 h-6 w-px bg-slate-200 dark:bg-slate-700" />
              <span className="h-2 w-2 rounded-full bg-red-500" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{order.pickup_address || 'Подача'}</p>
              <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{order.dropoff_address || 'Назначение'}</p>
            </div>
            {(order.distance_km != null || order.duration_min != null) && (
              <p className="shrink-0 text-[10px] text-slate-400">
                {order.distance_km != null ? `${Number(order.distance_km).toFixed(1)} км` : ''}
                {order.duration_min != null ? ` · ${order.duration_min} мин` : ''}
              </p>
            )}
          </div>

          {phase === 'payment' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/70">
                <span className="text-[11px] text-slate-500">К выплате</span>
                <span className="text-base font-black text-emerald-600">{formatTJS(earnings)} TJS</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-[10px] font-bold ${
                        method === m.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20'
                          : 'border-slate-200 text-slate-500 dark:border-slate-700'
                      }`}
                    >
                      <Icon size={14} /> {m.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => onPaid(method)}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-500 text-sm font-bold text-white"
              >
                Получить · {formatTJS(earnings)} TJS
              </button>
            </div>
          )}

          {phase === 'rate' && (
            <div className="space-y-3 text-center">
              <CheckCircle size={28} className="mx-auto text-emerald-500" />
              <p className="text-sm font-semibold">Оцените пассажира</p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setClientStars(s)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${clientStars >= s ? 'text-amber-500' : 'text-slate-300'}`}
                  >
                    <Star size={22} fill={clientStars >= s ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onRated(clientStars)}
                disabled={!clientStars}
                className={`h-12 w-full rounded-2xl text-sm font-bold ${
                  clientStars ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                }`}
              >
                Готово
              </button>
            </div>
          )}

          {phase === 'active' && (
            <>
              {order.status !== 'riding' && (
                <div className="flex gap-2">
                  {passengerInfo?.phone && (
                    <a
                      href={`tel:${passengerInfo.phone}`}
                      className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-slate-100 text-xs font-bold dark:bg-slate-800"
                    >
                      <Phone size={14} /> Звонок
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={onChat}
                    className={`relative flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-slate-100 text-xs font-bold dark:bg-slate-800 ${passengerInfo?.phone ? 'flex-1' : 'w-full'}`}
                  >
                    <MessageCircle size={14} /> Чат
                    {unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {order.status === 'found' && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => onAction('arrived')}
                    className="flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-500 text-sm font-bold text-white"
                  >
                    Я на месте
                  </button>
                  <button type="button" onClick={() => onAction('cancelled')} className="w-full py-1.5 text-xs font-semibold text-red-500">
                    Отменить
                  </button>
                </div>
              )}

              {order.status === 'arrived' && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => onAction('riding')}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-sm font-bold text-white"
                  >
                    <Navigation size={16} /> Начать поездку
                  </button>
                  <button type="button" onClick={() => onAction('cancelled')} className="w-full py-1.5 text-xs font-semibold text-red-500">
                    Отменить
                  </button>
                </div>
              )}

              {order.status === 'riding' && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => onAction('completed')}
                    className="flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-500 text-sm font-bold text-white"
                  >
                    Завершить
                  </button>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={onSos}
                      className="flex h-10 items-center justify-center gap-1 rounded-xl bg-red-50 text-[11px] font-bold text-red-600 dark:bg-red-900/20"
                    >
                      <AlertTriangle size={14} /> SOS
                    </button>
                    <button
                      type="button"
                      onClick={onShare}
                      className="flex h-10 items-center justify-center gap-1 rounded-xl bg-slate-100 text-[11px] font-bold dark:bg-slate-800"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={onChat}
                      className="relative flex h-10 items-center justify-center gap-1 rounded-xl bg-slate-100 text-[11px] font-bold dark:bg-slate-800"
                    >
                      <MessageCircle size={14} />
                      {unread > 0 && (
                        <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-red-500 text-[9px] text-white">{unread}</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
