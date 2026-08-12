import { useState } from 'react';
import { Users, Share2, MapPin, LogOut, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

export default function GroupRoutePanel({ groupRoute, members, onlineMembers, sharingEnabled, onLeave, onFinish, onToggleSharing }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();

  if (!groupRoute) return null;

  return (
    <div className="absolute bottom-[140px] left-2 right-2 md:bottom-auto md:left-auto md:top-[140px] md:right-4 z-[300]">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl border border-slate-200/60 dark:border-slate-800/80 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
            <Users size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-800 dark:text-white truncate">
              {t('groupRoute.title') || 'Групповой маршрут'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {onlineMembers.length} {t('groupRoute.online') || 'онлайн'}
            </div>
          </div>
          <button
            onClick={() => setExpanded(p => !p)}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            <Users size={14} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Route info */}
        <div className="px-4 pb-2 flex items-center gap-2 text-xs text-slate-500">
          <MapPin size={12} className="text-emerald-500" />
          <span className="truncate">{groupRoute.from_name || 'Откуда'}</span>
          <span className="text-slate-300">→</span>
          <span className="truncate">{groupRoute.to_name || 'Куда'}</span>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-slate-100 dark:border-slate-800">
            {/* Members avatars */}
            <div className="px-4 py-3">
              <div className="text-xs font-medium text-slate-500 mb-2">
                {t('groupRoute.members') || 'Участники'}
              </div>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-full pl-1 pr-2.5 py-1"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                      m.role === 'creator' ? 'bg-blue-500' : 'bg-red-500'
                    }`}>
                      {(m.full_name || m.user_id || '?')[0]}
                    </div>
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate max-w-[80px]">
                      {m.full_name || 'Участник'}
                    </span>
                    {m.lat && m.lng && (
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Share position toggle */}
            <div className="px-4 py-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Share2 size={14} className="text-slate-500" />
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {t('groupRoute.sharePosition') || 'Делиться позицией'}
                </span>
              </div>
              <button
                onClick={onToggleSharing}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  sharingEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  sharingEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {/* Actions */}
            <div className="px-4 py-3 flex gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={onLeave}
                className="flex-1 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                <LogOut size={12} />
                {t('groupRoute.leave') || 'Выйти'}
              </button>
              {groupRoute.creator_id && (
                <button
                  onClick={onFinish}
                  className="flex-1 h-9 rounded-xl bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-600 transition-all"
                >
                  <CheckCircle size={12} />
                  {t('groupRoute.finish') || 'Завершить'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
