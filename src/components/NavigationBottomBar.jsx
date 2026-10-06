import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavigation } from '@/lib/NavigationContext';
import { Search, Menu, Pause, Play, Square, X, Volume2, VolumeX, Map, Settings, CornerUpRight } from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import { toast } from 'sonner';

function fmt(m){ if(!m) return '0 м'; if(m>=1000) return `${(m/1000).toFixed(1)} км`; return `${Math.round(m)} м`; }
function fmtMin(s){ if(!s) return '0 мин'; return `${Math.max(1, Math.round(s/60))} мин`; }

export default function NavigationBottomBar(){
  const { remainingDistance, remainingDuration, eta, isPaused, togglePause, stopNavigation, userPosition, routeData, reroute, voiceEnabled, toggleVoice, followUser, toggleFollow, alternativeRoute, useAlternative, dismissAlternative } = useNavigation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const time = eta ? eta.toLocaleTimeString('ru-RU',{hour:'2-digit', minute:'2-digit'}) : '--:--';
  const mins = fmtMin(remainingDuration);
  const km = fmt(remainingDistance);

  // Поиск во время навигации: выбрали место — сразу перестраиваем маршрут к нему
  const handleSelect = async (item) => {
    setSearchOpen(false);
    if (!item?.lat || !item?.lng) { toast.info('У выбранного пункта нет координат'); return; }
    if (!userPosition) { toast.error('Определяем ваше положение — попробуйте ещё раз'); return; }
    const profile = routeData?.mode === 'walking' ? 'walking' : routeData?.mode === 'cycling' ? 'cycling' : 'driving';
    const name = item.name || item.fullAddress || 'точка';
    toast.info(`Строю маршрут: ${name}…`);
    const res = await reroute(
      { lat: userPosition[0], lng: userPosition[1], shortName: 'Я' },
      { lat: item.lat, lng: item.lng, shortName: name, name },
      profile
    );
    if (res) toast.success(`Едем к: ${name}`);
    else toast.error('Не удалось построить маршрут к этой точке');
  };

  return (
    <>
      {/* Поиск по пунктам во время навигации */}
      {searchOpen && (
        <div className="absolute top-3 left-3 right-3 z-[900] pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchBar
                mapCenter={userPosition || undefined}
                onSelectResult={handleSelect}
              />
            </div>
            <button
              onClick={() => setSearchOpen(false)}
              className="w-9 h-9 rounded-[10px] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] border border-slate-100 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
              title="Закрыть поиск"
            >
              <X size={16} className="text-slate-600" />
            </button>
          </div>
        </div>
      )}

      {/* Предложение «Другая дорога» — более быстрый вариант, как на референсах */}
      {alternativeRoute && (
        <div className="absolute bottom-[134px] left-3 right-3 z-[800] pointer-events-auto animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="bg-white rounded-[14px] shadow-[0_8px_28px_rgba(0,0,0,0.22)] border border-blue-100 px-2.5 py-2 flex items-center gap-2.5">
            <button
              onClick={useAlternative}
              className="flex-1 min-w-0 flex items-center gap-2.5 text-left active:scale-[0.99] transition-transform"
              title="Переключиться на другую дорогу"
            >
              <span className="w-7 h-7 rounded-full bg-[#0a84ff] text-white flex items-center justify-center shrink-0 shadow-[0_2px_10px_rgba(10,132,255,0.45)]">
                <CornerUpRight size={14} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-black text-slate-900 leading-tight">Другая дорога</span>
                <span className="block text-[11px] font-semibold text-slate-500 truncate">
                  {fmtMin(alternativeRoute.route.duration)} · {fmt(alternativeRoute.route.distance)}
                </span>
              </span>
            </button>
            <span className="shrink-0 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-black">
              −{Math.max(1, Math.round(alternativeRoute.deltaSec / 60))} мин
            </span>
            <button
              onClick={dismissAlternative}
              className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0 active:scale-95 transition-all"
              title="Оставить текущую дорогу"
              aria-label="Скрыть предложение"
            >
              <X size={12} className="text-slate-500" />
            </button>
          </div>
        </div>
      )}

      {/* bottom bar like reference: white rounded */}
      <div className="absolute bottom-[88px] left-3 right-3 z-[800] pointer-events-auto">
        {/* подложка: клик вне меню закрывает его */}
        {menuOpen && (
          <div className="fixed inset-0 z-[799]" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}
        {/* меню навигации по кнопке «☰» */}
        {menuOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-60 bg-white rounded-[14px] shadow-[0_8px_28px_rgba(0,0,0,0.25)] border border-slate-100 p-1.5 z-[801]">
            <button
              onClick={() => { toggleVoice(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
              title={voiceEnabled ? 'Выключить озвучку' : 'Включить озвучку'}
            >
              {voiceEnabled
                ? <Volume2 size={16} className="text-[#0a84ff] shrink-0" />
                : <VolumeX size={16} className="text-slate-400 shrink-0" />}
              <span className="text-[13px] font-semibold text-slate-700">Озвучка</span>
              <span className={`ml-auto text-[11px] font-bold ${voiceEnabled ? 'text-[#0a84ff]' : 'text-slate-400'}`}>
                {voiceEnabled ? 'вкл' : 'выкл'}
              </span>
            </button>
            <button
              onClick={() => { toggleFollow(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
              title={followUser ? 'Показать весь маршрут' : 'Вернуться к камере за спиной'}
            >
              <Map size={16} className="text-[#0a84ff] shrink-0" />
              <span className="text-[13px] font-semibold text-slate-700">
                {followUser ? 'Обзор всего маршрута' : 'Вернуться к камере'}
              </span>
            </button>
            <button
              onClick={() => { setMenuOpen(false); navigate('/settings/navigator'); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
              title="Настройки навигации"
            >
              <Settings size={16} className="text-slate-500 shrink-0" />
              <span className="text-[13px] font-semibold text-slate-700">Настройки навигации</span>
            </button>
          </div>
        )}
        <div className="bg-white rounded-[14px] shadow-[0_8px_28px_rgba(0,0,0,0.22)] px-2.5 py-1.5 flex items-center gap-1.5">
          <button
            onClick={() => setSearchOpen(o => !o)}
            className={`w-7 h-7 rounded-[9px] flex items-center justify-center active:scale-95 transition-all ${
              searchOpen
                ? 'bg-[#0a84ff] shadow-[0_2px_10px_rgba(10,132,255,0.45)] ring-2 ring-blue-200'
                : 'bg-blue-50 hover:bg-blue-100 ring-1 ring-blue-100'
            }`}
            title="Поиск по пути"
          >
            <Search size={14} className={searchOpen ? 'text-white' : 'text-[#0a84ff]'} />
          </button>
          <div className="flex-1 flex items-center justify-center gap-4">
            <div className="text-center leading-none">
              <div className="text-[14px] font-black text-slate-900">{mins.split(' ')[0]}</div>
              <div className="text-[10px] font-medium text-slate-500 -mt-0.5">мин</div>
            </div>
            <div className="text-center leading-none">
              <div className="text-[14px] font-black text-slate-900">{time}</div>
              <div className="text-[10px] font-medium text-slate-500 -mt-0.5">прибытие</div>
            </div>
            <div className="text-center leading-none">
              <div className="text-[14px] font-black text-slate-900">{km.split(' ')[0]}</div>
              <div className="text-[10px] font-medium text-slate-500 -mt-0.5">{km.split(' ')[1]||'м'}</div>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className={`w-7 h-7 rounded-[9px] flex items-center justify-center active:scale-95 transition-all ${
              menuOpen ? 'bg-slate-200' : 'bg-slate-100 hover:bg-slate-200'
            }`}
            title="Меню навигации"
            aria-label="Меню навигации"
            aria-expanded={menuOpen}
          >
            <Menu size={14} className="text-slate-600" />
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
