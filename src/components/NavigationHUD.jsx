import { useNavigation } from '@/lib/NavigationContext';
import { ArrowUp, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight, Undo2, RotateCw, Flag, Navigation as NavStart } from 'lucide-react';

// Стрелка по манёвру OSRM: налево/направо/разворот/кольцо/финиш — а не всегда «↑»
function ManeuverArrow({ instruction, modifier }) {
  const size = 24;
  const cls = 'text-[#0a84ff] shrink-0';
  if (instruction === 'arrive') return <Flag size={size} className="text-emerald-500 shrink-0" />;
  if (instruction === 'depart') return <NavStart size={size} className={cls} />;
  if (instruction === 'roundabout' || instruction === 'rotary') return <RotateCw size={size} className={cls} />;
  if (instruction === 'uturn' || modifier === 'uturn') return <Undo2 size={size} className={cls} />;
  const m = modifier || '';
  if (m.includes('left')) return m.includes('sharp')
    ? <ArrowLeft size={size} className={cls} />
    : m.includes('slight') ? <ArrowUpLeft size={size} className={cls} /> : <ArrowLeft size={size} className={cls} />;
  if (m.includes('right')) return m.includes('sharp')
    ? <ArrowRight size={size} className={cls} />
    : m.includes('slight') ? <ArrowUpRight size={size} className={cls} /> : <ArrowRight size={size} className={cls} />;
  return <ArrowUp size={size} className={cls} />;
}

function formatDist(m){
  if(m>=1000) return `${(m/1000).toFixed(1)} км`;
  if(m>=1000) return `${(m/1000).toFixed(1)} км`;
  return `${Math.round(m)} м`;
}

export default function NavigationHUD(){
  const { nextInstruction, userSpeed } = useNavigation();
  if(!nextInstruction) return null;
  const dist = nextInstruction.distance ?? nextInstruction.dist ?? 0;
  const speed = Math.round((userSpeed||0)*3.6);
  const text = nextInstruction.text || 'Прямо';
  const street = nextInstruction.streetName || '';
  const m = Math.round(dist);
  const label = m < 20 ? `${m} м` : m < 1000 ? `${m} м` : `${(m/1000).toFixed(1)} км`;
  return (
    <>
      {/* top maneuver */}
      <div className="absolute top-3 left-3 z-[800] pointer-events-auto max-w-[62vw]">
        <div className="bg-white rounded-[14px] shadow-[0_4px_16px_rgba(0,0,0,0.18)] px-3 py-2 flex items-center gap-2.5 min-w-[96px]">
          <ManeuverArrow instruction={nextInstruction.instruction} modifier={nextInstruction.modifier} />
          <div className="min-w-0">
            <div className="text-[18px] font-black tracking-tight text-slate-900 leading-none">{label}</div>
            <div className="text-[11px] font-semibold text-slate-600 leading-tight mt-0.5 truncate">{text}{street ? ` · ${street}` : ''}</div>
          </div>
        </div>
      </div>
      {/* speed */}
      <div className="absolute top-3 right-3 z-[800] pointer-events-auto flex flex-col items-center gap-1.5">
        <div className="w-[56px] h-[56px] rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] flex items-center justify-center border border-slate-100">
          <span className="text-[22px] font-black text-slate-900">{speed}</span>
        </div>
        {speed===0 && (
          <div className="w-[36px] h-[28px] rounded-[10px] bg-white shadow flex items-center justify-center border border-slate-100">
            <span className="text-[#0a84ff] font-black text-[14px]">P</span>
          </div>
        )}
      </div>
      {/* compass handled by MapControls, not here */}
    </>
  );
}
