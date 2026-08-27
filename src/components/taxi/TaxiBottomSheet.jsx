import { useState, useRef, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';

export default function TaxiBottomSheet({ children, driverStats, isOnline }) {
  const [expanded, setExpanded] = useState(false);
  const startY = useRef(0);

  const handleTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const diff = startY.current - e.changedTouches[0].clientY;
    if (diff > 40) setExpanded(true);
    else if (diff < -40) setExpanded(false);
  }, []);

  if (!isOnline) return null;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3 pb-2 md:mx-auto md:max-w-md"
    >
      <div className="pointer-events-auto overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/92 shadow-[0_8px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/92">
        <button
          type="button"
          className="flex w-full flex-col items-center pt-2"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        </button>

        {!expanded && driverStats && (
          <div className="grid grid-cols-3 gap-1 px-4 pb-3 pt-2">
            {driverStats.map((s) => (
              <div key={s.label} className="min-w-0 text-center">
                <p className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">{s.value}</p>
                <p className="text-[10px] font-medium text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex w-full items-center justify-center gap-1 pb-3 text-[11px] font-medium text-slate-400"
          >
            <ChevronUp size={14} />
            Подробнее
          </button>
        )}

        {expanded && (
          <div className="custom-scrollbar max-h-[46vh] overflow-y-auto px-4 pb-4 pt-1">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
