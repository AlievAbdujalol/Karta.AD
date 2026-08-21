import { useState } from 'react';
import { Bell, Settings, X, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationCount } from '@/lib/NotificationContext';

export default function TaxiTopBar({ isOnline, onToggle, userName, userPhoto }) {
  const navigate = useNavigate();
  const { count, notifications, clear, markAsRead } = useNotificationCount();
  const [showPanel, setShowPanel] = useState(false);

  return (
    <div className="absolute top-0 left-0 right-0 z-40 px-4 pt-3 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)' }}>
      <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 dark:border-slate-700/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                {userPhoto ? (
                  <img src={userPhoto} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-sm">{userName?.[0] || '?'}</span>
                )}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${isOnline ? 'bg-emerald-400' : 'bg-slate-400'}`} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">{userName || 'Водитель'}</p>
              <p className={`text-[10px] font-semibold ${isOnline ? 'text-emerald-500' : 'text-slate-400'}`}>
                {isOnline ? 'На линии' : 'Оффлайн'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowPanel(!showPanel)}
              className="w-9 h-9 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors relative"
            >
              <Bell size={16} />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full border border-white dark:border-slate-900 flex items-center justify-center">
                  <span className="text-[8px] text-white font-bold">{count > 9 ? '9+' : count}</span>
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="w-9 h-9 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={onToggle}
            className={`w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              isOnline
                ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-white/60'}`} />
            {isOnline ? 'Выйти с линии' : 'Войти на линию'}
          </button>
        </div>
      </div>

      {/* Notification Panel */}
      {showPanel && (
        <div className="fixed inset-0 z-50" onClick={() => setShowPanel(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="absolute top-20 left-4 right-4 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[60vh] overflow-hidden animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-blue-500" />
                <h3 className="text-sm font-bold">Уведомления</h3>
                {count > 0 && <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full">{count}</span>}
              </div>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <button onClick={clear} className="text-[10px] text-blue-500 font-bold px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    Очистить все
                  </button>
                )}
                <button onClick={() => setShowPanel(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[50vh] custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="text-center py-8">
                  <Bell size={24} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Нет уведомлений</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => markAsRead(n.id)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-50 dark:border-slate-800/50 transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bell size={12} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{n.title || 'Уведомление'}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{n.body || ''}</p>
                      <p className="text-[9px] text-slate-300 dark:text-slate-600 mt-1">
                        {new Date(n.created_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                    <Check size={12} className="text-slate-300 flex-shrink-0 mt-1" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
