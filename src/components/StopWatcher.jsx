import { useState } from 'react';
import { Bell, BellOff, ChevronDown, MapPin } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

export default function StopWatcher({ route, watchedStop, onWatch }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(Notification.permission);

  if (!route?.stops?.length) return null;
  const stops = route.stops.filter(s => s.name && s.lat && s.lng);
  if (!stops.length) return null;

  const requestAndSet = async (stop) => {
    if (permission !== 'granted') {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p !== 'granted') return;
    }
    onWatch(stop);
    setOpen(false);
  };

  return (
    <div className="relative">
      {watchedStop ? (
        <button
          onClick={() => onWatch(null)}
          className="flex items-center gap-2 text-white text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-br from-orange-600 to-amber-500 shadow-lg shadow-orange-500/40 active:scale-95 transition-all"
        >
          <Bell size={13} className="animate-pulse" />
          <span className="max-w-[80px] sm:max-w-[100px] md:max-w-[120px] truncate">{watchedStop.name}</span>
          <BellOff size={11} className="opacity-70" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-xl bg-white/97 dark:bg-slate-800/95 shadow-lg dark:shadow-black/30 border border-black/5 dark:border-slate-700 active:scale-95 transition-all"
        >
          <Bell size={13} className="text-blue-600 dark:text-blue-400" />
          <span>{t('stopwatcher.notifyButton')}</span>
          <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {open && !watchedStop && (
        <div className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden z-50 min-w-[200px] max-w-[260px] max-h-56 overflow-y-auto shadow-xl dark:shadow-black/40 border border-black/5 dark:border-slate-700">
          <div className="sticky top-0 bg-white dark:bg-slate-900 px-3 pt-3 pb-2 border-b border-slate-100 dark:border-slate-700">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center gap-1">
              <MapPin size={9} /> {t('stopwatcher.selectStop')}
            </p>
          </div>
          {stops.map((s, i) => (
            <button
              key={i}
              onMouseDown={() => requestAndSet(s)}
              className="w-full text-left px-3 py-3 min-h-[44px] text-xs text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center gap-2.5 border-b border-slate-50 dark:border-slate-800 last:border-0 transition-colors"
            >
              <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
