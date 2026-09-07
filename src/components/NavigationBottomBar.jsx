import { useNavigation } from '@/lib/NavigationContext';
import { Search, Menu, Pause, Play, Square } from 'lucide-react';

function fmt(m){ if(!m) return '0 м'; if(m>=1000) return `${(m/1000).toFixed(1)} км`; return `${Math.round(m)} м`; }
function fmtMin(s){ if(!s) return '0 мин'; return `${Math.max(1, Math.round(s/60))} мин`; }

export default function NavigationBottomBar(){
  const { remainingDistance, remainingDuration, eta, isPaused, togglePause, stopNavigation } = useNavigation();
  const time = eta ? eta.toLocaleTimeString('ru-RU',{hour:'2-digit', minute:'2-digit'}) : '--:--';
  const mins = fmtMin(remainingDuration);
  const km = fmt(remainingDistance);
  return (
    <>
      {/* bottom bar like reference: white rounded */}
      <div className="absolute bottom-[88px] left-3 right-3 z-[800] pointer-events-auto">
        <div className="bg-white rounded-[16px] shadow-[0_8px_28px_rgba(0,0,0,0.22)] px-3 py-2.5 flex items-center gap-2">
          <button className="w-9 h-9 rounded-[10px] bg-slate-100 flex items-center justify-center">
            <Search size={16} className="text-slate-600" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-6">
            <div className="text-center leading-none">
              <div className="text-[18px] font-black text-slate-900">{mins.split(' ')[0]}</div>
              <div className="text-[11px] font-medium text-slate-500 -mt-0.5">мин</div>
            </div>
            <div className="text-center leading-none">
              <div className="text-[18px] font-black text-slate-900">{time}</div>
              <div className="text-[11px] font-medium text-slate-500 -mt-0.5">прибытие</div>
            </div>
            <div className="text-center leading-none">
              <div className="text-[18px] font-black text-slate-900">{km.split(' ')[0]}</div>
              <div className="text-[11px] font-medium text-slate-500 -mt-0.5">{km.split(' ')[1]||'м'}</div>
            </div>
          </div>
          <button className="w-9 h-9 rounded-[10px] bg-slate-100 flex items-center justify-center">
            <Menu size={16} className="text-slate-600" />
          </button>
        </div>
      </div>
      {/* controls hidden in reference during nav - show small pause/stop as overlay second row if needed */}
      <div className="absolute bottom-[18px] left-3 right-3 z-[800] pointer-events-auto flex gap-2">
        <button onClick={togglePause} className="flex-1 bg-slate-900/90 backdrop-blur text-white rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5">
          {isPaused ? <Play size={12}/> : <Pause size={12}/>} {isPaused?'Продолжить':'Пауза'}
        </button>
        <button onClick={stopNavigation} className="flex-1 bg-[#ff3b30] text-white rounded-xl py-2.5 text-xs font-black flex items-center justify-center gap-1.5">
          <Square size={10} className="fill-white"/> Завершить
        </button>
      </div>
    </>
  );
}
