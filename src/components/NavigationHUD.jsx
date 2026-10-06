import { useNavigation } from '@/lib/NavigationContext';
import { ArrowUp, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight, Undo2, RotateCw, Flag, Navigation as NavStart, Loader2, AlertTriangle, MapPin, Volume2, VolumeX, Satellite } from 'lucide-react';

function ManeuverArrow({ instruction, modifier }) {
  const size = 26;
  const cls = 'shrink-0';
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

export default function NavigationHUD() {
  const {
    nextInstruction, followingStep, userSpeed, gpsAccuracy,
    isOffRoute, isRerouting, hasArrived,
    voiceEnabled, toggleVoice,
  } = useNavigation();
  if (!nextInstruction) return null;

  const dist = nextInstruction.distance ?? nextInstruction.dist ?? 0;
  const speedKmh = Math.round((userSpeed || 0) * 3.6);
  const moving = (userSpeed || 0) >= 1;
  const text = nextInstruction.text || 'Прямо';
  const street = nextInstruction.streetName || '';
  const m = Math.round(dist);
  const label = m < 1000 ? `${m} м` : `${(m / 1000).toFixed(1)} км`;
  const active = nextInstruction.instruction && nextInstruction.instruction !== 'depart';
  const gpsLow = gpsAccuracy != null && gpsAccuracy > 50;

  const nextName = followingStep?.name || '';
  const showNext = !!nextName && nextName !== street;

  return (
    <>
      {/* Top maneuver: blue when guiding, white when idle */}
      <div className="absolute top-3 left-3 z-[800] pointer-events-auto max-w-[72vw]">
        <div className="flex items-start gap-2">
          <div className={
            active
              ? 'bg-[#2563eb] text-white rounded-[14px] shadow-[0_4px_16px_rgba(37,99,235,0.4)] px-3 py-2 flex items-center gap-2.5 min-w-[128px]'
              : 'bg-white text-slate-900 rounded-[14px] shadow-[0_4px_16px_rgba(0,0,0,0.18)] px-3 py-2 flex items-center gap-2.5 min-w-[96px]'
          }>
            <span className={active ? 'text-white' : 'text-[#0a84ff]'}>
              <ManeuverArrow instruction={nextInstruction.instruction} modifier={nextInstruction.modifier} />
            </span>
            <div className="min-w-0">
              <div className="text-[18px] font-black tracking-tight leading-none">{label}</div>
              <div className={`text-[11px] font-semibold leading-tight mt-0.5 truncate ${active ? 'text-blue-100' : 'text-slate-600'}`}>{text}</div>
              {active && showNext && (
                <div className="text-[11px] leading-tight mt-1 pt-1 truncate border-t border-white/25 text-blue-100">
                  Далее: {nextName}
                </div>
              )}
              {!active && street && (
                <div className="text-[11px] text-slate-500 leading-tight mt-0.5 truncate">{street}</div>
              )}
            </div>
          </div>
          <button
            onClick={toggleVoice}
            title={voiceEnabled ? 'Выключить озвучку' : 'Включить озвучку'}
            className="w-11 h-11 rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] border border-slate-100 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
          >
            {voiceEnabled
              ? <Volume2 size={18} className="text-slate-700" />
              : <VolumeX size={18} className="text-slate-400" />}
          </button>
        </div>

        {/* Rerouting indicator */}
        {isRerouting && (
          <div className="mt-1.5 bg-amber-500 text-white rounded-xl px-3 py-1.5 flex items-center gap-2 text-[11px] font-bold shadow-lg">
            <Loader2 size={13} className="animate-spin" />
            Пересчитываю маршрут…
          </div>
        )}

        {/* Off-route warning */}
        {isOffRoute && !isRerouting && (
          <div className="mt-1.5 bg-[#ef4444] text-white rounded-xl px-3 py-2 flex items-center gap-2 text-[12px] font-bold shadow-lg">
            <AlertTriangle size={14} className="shrink-0" />
            Вы отклонились от маршрута
          </div>
        )}

        {/* Low GPS accuracy */}
        {gpsLow && !isOffRoute && (
          <div className="mt-1.5 bg-[#f59e0b] text-white rounded-xl px-3 py-1.5 flex items-center gap-2 text-[11px] font-bold shadow-lg">
            <Satellite size={13} className="shrink-0" />
            Низкий уровень GPS
          </div>
        )}

        {/* Arrival */}
        {hasArrived && (
          <div className="mt-1.5 bg-emerald-500 text-white rounded-xl px-3 py-1.5 flex items-center gap-2 text-[11px] font-bold shadow-lg">
            <MapPin size={13} />
            Вы прибыли!
          </div>
        )}
      </div>

      {/* Speed badge — top-right (левее колонки кнопок карты), only while moving */}
      {moving && (
        <div className="absolute right-14 top-3 z-[800] pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] border-2 border-[#ef4444] flex flex-col items-center justify-center leading-none">
            <span className="text-[20px] font-black text-slate-900">{speedKmh}</span>
            <span className="text-[9px] font-bold text-slate-500">км/ч</span>
          </div>
        </div>
      )}
    </>
  );
}
