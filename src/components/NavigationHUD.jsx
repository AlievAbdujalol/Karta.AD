import { useNavigation } from '@/lib/NavigationContext';

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
  const text = nextInstruction.text || nextInstruction.streetName || 'Прямо';
  const m = Math.round(dist);
  const label = m < 20 ? `${m} м` : m < 1000 ? `${m} м` : `${(m/1000).toFixed(1)} км`;
  return (
    <>
      {/* top maneuver */}
      <div className="absolute top-3 left-3 z-[800] pointer-events-auto">
        <div className="bg-white rounded-[14px] shadow-[0_4px_16px_rgba(0,0,0,0.18)] px-3 py-2 flex items-center gap-2.5 min-w-[96px]">
          <span className="text-[#0a84ff] text-[22px] leading-none">↑</span>
          <span className="text-[18px] font-black tracking-tight text-slate-900">{label}</span>
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
