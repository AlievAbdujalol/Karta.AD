import { useState } from 'react';
import { Bell, BellOff, ChevronDown, MapPin } from 'lucide-react';

export default function StopWatcher({ route, watchedStop, onWatch }) {
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
          className="flex items-center gap-2 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-lg"
          style={{ background: 'linear-gradient(135deg, #FF6D00, #FF8F00)', boxShadow: '0 4px 14px rgba(255,109,0,0.4)' }}
        >
          <Bell size={13} className="animate-pulse" />
          <span className="max-w-[100px] truncate">{watchedStop.name}</span>
          <BellOff size={11} className="opacity-70" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-gray-700 text-xs font-semibold px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <Bell size={13} className="text-blue-600" />
          <span>Уведомить</span>
          <ChevronDown size={12} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {open && !watchedStop && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-2xl overflow-hidden z-50 min-w-[200px] max-w-[260px] max-h-56 overflow-y-auto"
          style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="sticky top-0 bg-white px-3 pt-3 pb-2 border-b border-gray-50">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold flex items-center gap-1">
              <MapPin size={9} /> Выберите остановку
            </p>
          </div>
          {stops.map((s, i) => (
            <button
              key={i}
              onMouseDown={() => requestAndSet(s)}
              className="w-full text-left px-3 py-2.5 text-xs text-gray-700 hover:bg-blue-50 flex items-center gap-2.5 border-b border-gray-50 last:border-0 transition-colors"
            >
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}