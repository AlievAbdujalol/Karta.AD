import { useNavigation } from '@/lib/NavigationContext';
import { Navigation, ArrowRight, ArrowLeft, ChevronUp, RotateCcw } from 'lucide-react';

function formatDist(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} км`;
  return `${Math.round(m)} м`;
}

function formatTime(date) {
  if (!date) return '--:--';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function getManeuverIcon(instruction, modifier) {
  if (instruction === 'depart') return <Navigation size={22} className="text-white" />;
  if (instruction === 'arrive') return <span className="text-lg">🏁</span>;
  if (instruction === 'roundabout') return <RotateCcw size={20} className="text-white" />;
  if (instruction === 'uturn') return <RotateCcw size={20} className="text-white" style={{ transform: 'scaleX(-1)' }} />;

  if (modifier === 'right' || modifier === 'sharp right' || modifier === 'slight right') {
    return <ArrowRight size={22} className="text-white" />;
  }
  if (modifier === 'left' || modifier === 'sharp left' || modifier === 'slight left') {
    return <ArrowLeft size={22} className="text-white" />;
  }
  return <ChevronUp size={22} className="text-white" />;
}

export default function NavigationHUD() {
  const { nextInstruction, remainingDistance, eta, userSpeed, remainingDuration } = useNavigation();

  if (!nextInstruction) return null;

  const formatDur = (s) => {
    if (s >= 3600) {
      const h = Math.floor(s / 3600);
      const m = Math.round((s % 3600) / 60);
      return `${h} ч ${m} мин`;
    }
    return `${Math.round(s)} мин`;
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-[800] pointer-events-auto">
      <div className="mx-2 mt-2 sm:mx-4 sm:mt-3 bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
        {/* Maneuver banner */}
        <div className="flex items-center gap-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            {getManeuverIcon(nextInstruction.instruction, nextInstruction.modifier)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-extrabold text-lg leading-tight truncate">
              {formatDist(nextInstruction.distance)}
            </p>
            {nextInstruction.streetName && (
              <p className="text-blue-200 text-xs font-medium truncate mt-0.5">
                {nextInstruction.streetName}
              </p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-white font-bold text-sm">
              {userSpeed > 0 ? `${Math.round(userSpeed * 3.6)} км/ч` : ''}
            </p>
          </div>
        </div>

        {/* Bottom info row */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900">
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Осталось</p>
            <p className="text-sm font-bold text-white">{formatDist(remainingDistance)}</p>
          </div>
          <div className="w-px h-6 bg-slate-700" />
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Прибытие</p>
            <p className="text-sm font-bold text-emerald-400">{formatTime(eta)}</p>
          </div>
          <div className="w-px h-6 bg-slate-700" />
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Время</p>
            <p className="text-sm font-bold text-white">{formatDur(remainingDuration)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
