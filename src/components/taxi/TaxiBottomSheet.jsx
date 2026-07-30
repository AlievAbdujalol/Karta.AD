import { useState, useRef, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';

export default function TaxiBottomSheet({ children, driverStats, isOnline }) {
  const [peek, setPeek] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const sheetRef = useRef(null);
  const startY = useRef(0);

  const handleTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const diff = startY.current - e.changedTouches[0].clientY;
    if (diff > 50 && peek) { setPeek(false); setExpanded(true); }
    else if (diff < -50 && expanded) { setExpanded(false); setPeek(true); }
  }, [peek, expanded]);

  if (!isOnline) return null;

  return (
    <div
      ref={sheetRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`absolute bottom-16 left-0 right-0 z-40 transition-all duration-500 ease-out ${
        expanded
          ? 'max-h-[70vh]'
          : 'max-h-[220px]'
      }`}
    >
      <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-slate-200/60 dark:border-slate-700/60 overflow-hidden h-full flex flex-col">
        {/* Drag handle */}
        <div
          className="flex justify-center py-2 cursor-pointer flex-shrink-0"
          onClick={() => { setExpanded(!expanded); setPeek(expanded); }}
        >
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
        </div>

        {/* Peek stats row */}
        {peek && driverStats && (
          <div className="px-5 pb-4 flex-shrink-0">
            <div className="grid grid-cols-3 gap-3">
              {driverStats.map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-lg font-black text-slate-800 dark:text-slate-100">{s.value}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-1 mt-3 text-slate-400">
              <ChevronUp size={14} />
              <span className="text-[10px] font-medium">Проведите вверх для подробностей</span>
            </div>
          </div>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="flex-1 overflow-y-auto px-5 pb-4 custom-scrollbar">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
