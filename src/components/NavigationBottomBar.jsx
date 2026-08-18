import { useNavigation } from '@/lib/NavigationContext';
import { Pause, Play, Square, Volume2, VolumeX, Crosshair } from 'lucide-react';

function formatDist(m) {
  if (!m) return '0 м';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} км`;
  return `${Math.round(m)} м`;
}

function formatDur(s) {
  if (!s) return '0 мин';
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return `${h} ч ${m} мин`;
  }
  return `${Math.round(s)} мин`;
}

function formatTime(date) {
  if (!date) return '--:--';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function NavigationBottomBar() {
  const {
    isPaused, remainingDistance, remainingDuration, eta,
    voiceEnabled, followUser, tripStats,
    togglePause, stopNavigation, toggleVoice, toggleFollow,
  } = useNavigation();

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[800] pointer-events-auto">
      <div className="mx-2 mb-2 sm:mx-4 sm:mb-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/60 dark:border-slate-700/50 overflow-hidden">
        {/* Stats row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Осталось</p>
            <p className="text-base font-extrabold text-slate-900 dark:text-white">{formatDist(remainingDistance)}</p>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Время</p>
            <p className="text-base font-extrabold text-slate-900 dark:text-white">{formatDur(remainingDuration)}</p>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">ETA</p>
            <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{formatTime(eta)}</p>
          </div>
        </div>

        {/* Traveled stats */}
        {tripStats.distance > 0 && (
          <div className="flex items-center justify-between px-4 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-400">Пройдено: <span className="font-bold text-slate-600 dark:text-slate-300">{formatDist(tripStats.distance)}</span></span>
            <span className="text-[10px] text-slate-400">Средняя: <span className="font-bold text-slate-600 dark:text-slate-300">{Math.round(tripStats.avgSpeed)} км/ч</span></span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 px-3 py-3">
          {/* Pause/Resume */}
          <button
            onClick={togglePause}
            className="flex-1 h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {isPaused ? <Play size={15} /> : <Pause size={15} />}
            {isPaused ? 'Продолжить' : 'Пауза'}
          </button>

          {/* Stop */}
          <button
            onClick={stopNavigation}
            className="flex-1 h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25"
          >
            <Square size={14} className="fill-white" />
            Завершить
          </button>

          {/* Voice */}
          <button
            onClick={toggleVoice}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
              voiceEnabled
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}
          >
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Follow */}
          <button
            onClick={toggleFollow}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
              followUser
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}
          >
            <Crosshair size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
