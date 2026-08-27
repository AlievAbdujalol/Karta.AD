import { useState } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { useNotificationCount } from '@/lib/NotificationContext';

export default function TaxiTopBar({ isOnline, onToggle, userName, userPhoto }) {
  const { count, notifications, clear, markAsRead } = useNotificationCount();
  const [showPanel, setShowPanel] = useState(false);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-40 px-3"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 10px), 10px)' }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-2">
        <div className="glass-pill flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-2 py-1.5">
          <div className="relative shrink-0">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {userPhoto ? (
                <img src={userPhoto} alt="" className="h-full w-full object-cover" />
              ) : (
                userName?.[0] || '?'
              )}
            </div>
            <span
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight text-slate-900 dark:text-white">
              {userName || 'Водитель'}
            </p>
            <p className={`text-[11px] font-medium ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              {isOnline ? 'На линии' : 'Офлайн'}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-bold transition-all active:scale-[0.97] ${
              isOnline
                ? 'bg-red-500 text-white shadow-sm shadow-red-500/25'
                : 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25'
            }`}
          >
            {isOnline ? 'Офлайн' : 'На линию'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowPanel(true)}
          className="glass-pill relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 dark:text-slate-300"
          aria-label="Уведомления"
        >
          <Bell size={18} />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </div>

      {showPanel && (
        <div className="pointer-events-auto fixed inset-0 z-50" onClick={() => setShowPanel(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
          <div
            className="absolute left-3 right-3 top-16 mx-auto max-h-[60vh] max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-bold">Уведомления</h3>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <button type="button" onClick={clear} className="rounded-lg px-2 py-1 text-[11px] font-bold text-blue-600">
                    Очистить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPanel(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400"
                  aria-label="Закрыть"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="custom-scrollbar max-h-[50vh] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-400">Нет уведомлений</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    className="flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left dark:border-slate-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{n.title || 'Уведомление'}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">{n.body || ''}</p>
                    </div>
                    <Check size={12} className="mt-1 shrink-0 text-slate-300" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
