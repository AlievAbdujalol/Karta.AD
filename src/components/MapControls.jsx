import { useState, useRef, useCallback } from 'react';
import { Layers, Crosshair, Plus, Minus, Navigation, Share2, LocateFixed, Route, Car, Bus, MoreHorizontal } from 'lucide-react';
import { useMap } from 'react-leaflet';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';
import { cartoRaster, cartoLabels, OSM_URL, CARTO_KEY, googleTiles, ESRI_DARK_GRAY_URL } from '@/lib/tiles';
import { getCachedLastLocation, saveLastLocation } from '@/lib/locationCache';

// 9 слоёв без needsKey-пропусков: без VITE_CARTO_API_KEY «Стандарт» — OSM
// (цветная схема), «Тёмная» — Esri Dark Gray Canvas — все номера 1..9 достижимы.
const TILE_LAYERS = [
  { labelKey: 'mapControls.layerStandard', url: cartoRaster('rastertiles/voyager'), isHybrid: false },
  { labelKey: 'mapControls.layerDark', url: CARTO_KEY ? cartoRaster('dark_all') : ESRI_DARK_GRAY_URL, isHybrid: false },
  { labelKey: 'mapControls.layerGoogle', url: googleTiles('m'), isHybrid: false },
  { labelKey: 'mapControls.layerHybrid', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', isHybrid: true },
  { labelKey: 'mapControls.layerOsm', url: OSM_URL, isHybrid: false },
  { labelKey: 'mapControls.layerEsriStreet', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', isHybrid: false },
  { labelKey: 'mapControls.layerEsriTopo', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', isHybrid: false },
  { labelKey: 'mapControls.layerGoogleSat', url: googleTiles('s'), isHybrid: true },
  { labelKey: 'mapControls.layerGoogleHybrid', url: googleTiles('y'), isHybrid: true },
];

const LABEL_OVERLAY_URL = cartoLabels();
const TRANSPORT_OVERLAY_URL = 'https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png';

export const TILE_KEY = 'karta_tile_index';

/**
 * Начальный слой: сохранённый индекс из localStorage, иначе «1 Стандарт».
 * Все 9 слоёв работают без ключа CARTO (см. TILE_LAYERS) — никаких
 * needsKey-откатов: сохранённый индекс принимается всегда, старт — 0.
 */
export function initialTileIndex() {
  try {
    const v = localStorage.getItem(TILE_KEY);
    if (v != null) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= 0 && n < TILE_LAYERS.length) return n;
    }
  } catch { /* localStorage недоступен — стартовый слой */ }
  return 0;
}

export default function MapControls({ tileIndex, setTileIndex, finderActive, onFinderToggle, onShareTrip, rightOffset, isNavigating, onLocate, tiltEnabled: _tiltEnabled, onToggleTilt: _onToggleTilt, autoCenter, onToggleAutoCenter, overviewActive, onToggleOverview, showTraffic, onToggleTraffic, showTransport, onToggleTransport, locating: locatingProp = false }) {
  const map = useMap();
  const { t } = useLanguage();
  // Второстепенные переключатели (трафик/транспорт/авто-центр) свёрнуты в «⋯»:
  // основная рейка короче и не перегружает экран.
  const [moreOpen, setMoreOpen] = useState(false);
  // Защита от неконтролируемых параллельных запросов геолокации при повторных нажатиях.
  const locateLockRef = useRef(false);
  // Локальное состояние загрузки для ветки без onLocate (родитель управляет propre locating сам).
  const [locatingLocal, setLocatingLocal] = useState(false);

  const locate = useCallback(() => {
    if (locateLockRef.current) return;
    if (onLocate) { onLocate(); return; }
    // Свежий кэш позиции — прыжок мгновенный, без ожидания GPS
    const cached = getCachedLastLocation(5 * 60 * 1000);
    if (cached) {
      toast.success('Вы на карте', { id: 'locate' });
      map.flyTo([cached.lat, cached.lng], 16, { animate: true, duration: 0.8 });
      return;
    }
    locateLockRef.current = true;
    setLocatingLocal(true);
    toast.loading(t('mapControls.myLocation') || 'Определяем местоположение…', { id: 'locate' });
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        locateLockRef.current = false;
        setLocatingLocal(false);
        toast.dismiss('locate');
        toast.success('Вы на карте');
        saveLastLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { animate: true, duration: 0.8 });
      },
      (err) => {
        locateLockRef.current = false;
        setLocatingLocal(false);
        toast.dismiss('locate');
        if (err.code === 1) toast.error('\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u0433\u0435\u043E\u043B\u043E\u043A\u0430\u0446\u0438\u0438 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435');
        else if (err.code === 2) toast.error('\u0413\u0435\u043E\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430');
        else if (err.code === 3) toast.error('\u041f\u0440\u0435\u0432\u044b\u0448\u0435\u043d\u043e \u0432\u0440\u0435\u043c\u044f \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u044f \u0413\u041f\u0421 \u2014 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437');
        else toast.error('\u0413\u0435\u043E\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u0438\u0441\u0442\u0435\u043A\u043B\u0430');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, [onLocate, map]);

  // Состояние загрузки определения местоположения: либо родитель управляет процессом
  // (проп locating), либо мы сами запрашиваем GPS (защита locateLockRef).
  const locatePending = Boolean(locatedLocating());
  function locatedLocating() { return locatingProp || locateLockRef.current || locatingLocal; }

  const cycleLayer = () => setTileIndex((i) => (i + 1) % TILE_LAYERS.length);

  const btnBase = "flex items-center justify-center rounded-2xl shadow-[0_4px_16px_rgba(15,23,42,0.1)] border border-slate-200/60 dark:border-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none backdrop-blur-xl";

  return (
    <>
      {/* ===== DESKTOP: Right side vertical ===== */}
      <div
        className={`hidden md:flex absolute z-[999] flex-col gap-2 pointer-events-auto transition-all duration-300 ${isNavigating ? 'top-[64%] -translate-y-1/2' : 'top-1/2 -translate-y-1/2'}`}
        style={{ right: `${(rightOffset || 0) + 16}px` }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!isNavigating && (
          <button onClick={() => onFinderToggle?.()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90 ${finderActive ? '!bg-violet-600 !text-white border-violet-400 shadow-violet-500/30' : ''}`} title={t('routeFinder.button')} aria-pressed={finderActive ? 'true' : 'false'}>
            <Navigation size={18} className="stroke-[2.2]" />
          </button>
        )}
        {isNavigating && (
          <button onClick={() => onToggleOverview?.()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90 ${overviewActive ? '!bg-blue-600 !text-white border-blue-400 shadow-blue-500/30' : ''}`} title="Весь маршрут — от и до" aria-pressed={overviewActive ? 'true' : 'false'}>
            <Route size={18} className="stroke-[2.2]" />
          </button>
        )}
        <button onClick={locate} className={`${btnBase} w-10 h-10 ${locatePending ? '!bg-blue-600 !text-white shadow-blue-500/40' : 'bg-white/90 dark:bg-slate-900/90'} border-none`} title={t('mapControls.myLocation')} aria-pressed={locatePending ? 'true' : 'false'}>
          <Crosshair size={18} className={`stroke-[2.2] ${locatePending ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => map.zoomIn()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90`} title={t('mapControls.zoomIn')}>
          <Plus size={18} className="stroke-[2.2]" />
        </button>
        <button onClick={() => map.zoomOut()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90`} title={t('mapControls.zoomOut')}>
          <Minus size={18} className="stroke-[2.2]" />
        </button>
        {moreOpen && (
          <>
            <button onClick={() => onToggleTraffic?.()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90 ${showTraffic ? '!bg-orange-500 !text-white' : ''}`} title="Трафик" aria-pressed={showTraffic ? 'true' : 'false'}>
              <Car size={18} className="stroke-[2.2]" />
            </button>
            <button onClick={() => onToggleTransport?.()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90 ${showTransport ? '!bg-blue-600 !text-white' : ''}`} title="Транспорт" aria-pressed={showTransport ? 'true' : 'false'}>
              <Bus size={18} className="stroke-[2.2]" />
            </button>
            <button onClick={() => onToggleAutoCenter?.()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90 ${autoCenter ? '!bg-emerald-600 !text-white' : ''}`} title="Авто-центр" aria-pressed={autoCenter ? 'true' : 'false'}>
              <LocateFixed size={18} className="stroke-[2.2]" />
            </button>
          </>
        )}
        <button onClick={() => setMoreOpen(v => !v)} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90 ${(showTraffic || showTransport || autoCenter) ? '!bg-slate-700 !text-white dark:!bg-slate-600' : ''}`} title="Ещё — трафик, транспорт, авто-центр" aria-pressed={(showTraffic || showTransport || autoCenter) ? 'true' : 'false'}>
          <MoreHorizontal size={18} className="stroke-[2.2]" />
        </button>
        <button onClick={cycleLayer} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90 relative`} title={`${t('mapControls.layerLabel')} ${t(TILE_LAYERS[tileIndex].labelKey)}`}>
          <Layers size={18} className="stroke-[2.2]" />
          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[9px] font-black border-2 border-white dark:border-slate-900 shadow-sm">{tileIndex + 1}</span>
        </button>
        {onShareTrip && (
          <button onClick={onShareTrip} className={`${btnBase} w-10 h-10 !bg-gradient-to-tr !from-emerald-500 !to-teal-500 hover:!from-emerald-600 hover:!to-teal-600 !text-white border-none shadow-emerald-500/20`} title={t('groupRoute.shareTrip') || '\u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F \u043F\u043E\u0435\u0437\u0434\u043A\u043E\u0439'}>
            <Share2 size={18} className="stroke-[2.2]" />
          </button>
        )}
      </div>

      {/* ===== MOBILE: Compact bottom-right cluster ===== */}
      <div
        className={`md:hidden absolute right-3 z-[999] flex flex-col gap-2 pointer-events-auto transition-all duration-300 ${isNavigating ? 'bottom-[220px]' : 'bottom-[90px]'}`}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!isNavigating && (
          <button onClick={() => onFinderToggle?.()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90 ${finderActive ? '!bg-violet-600 !text-white border-violet-400 shadow-violet-500/30' : ''}`}>
            <Navigation size={15} className="stroke-[2.2]" />
          </button>
        )}
        {isNavigating && (
          <button onClick={() => onToggleOverview?.()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90 ${overviewActive ? '!bg-blue-600 !text-white border-blue-400 shadow-blue-500/30' : ''}`} title="Весь маршрут — от и до" aria-pressed={overviewActive ? 'true' : 'false'}>
            <Route size={15} className="stroke-[2.2]" />
          </button>
        )}
        <button onClick={locate} className={`${btnBase} w-9 h-9 ${locatePending ? '!bg-blue-600 !text-white shadow-blue-500/40' : 'bg-white/90 dark:bg-slate-900/90'} border-none`} title={t('mapControls.myLocation')} aria-pressed={locatePending ? 'true' : 'false'}>
          <Crosshair size={15} className={`stroke-[2.2] ${locatePending ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => map.zoomIn()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90`}>
          <Plus size={15} className="stroke-[2.2]" />
        </button>
        <button onClick={() => map.zoomOut()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90`}>
          <Minus size={15} className="stroke-[2.2]" />
        </button>
        {moreOpen && (
          <>
            <button onClick={() => onToggleTraffic?.()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90 ${showTraffic ? '!bg-orange-500 !text-white' : ''}`} aria-pressed={showTraffic ? 'true' : 'false'}>
              <Car size={15} className="stroke-[2.2]" />
            </button>
            <button onClick={() => onToggleTransport?.()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90 ${showTransport ? '!bg-blue-600 !text-white' : ''}`} aria-pressed={showTransport ? 'true' : 'false'}>
              <Bus size={15} className="stroke-[2.2]" />
            </button>
            <button onClick={() => onToggleAutoCenter?.()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90 ${autoCenter ? '!bg-emerald-600 !text-white' : ''}`} aria-pressed={autoCenter ? 'true' : 'false'}>
              <LocateFixed size={15} className="stroke-[2.2]" />
            </button>
          </>
        )}
        <button onClick={() => setMoreOpen(v => !v)} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90 ${(showTraffic || showTransport || autoCenter) ? '!bg-slate-700 !text-white dark:!bg-slate-600' : ''}`} aria-pressed={(showTraffic || showTransport || autoCenter) ? 'true' : 'false'}>
          <MoreHorizontal size={15} className="stroke-[2.2]" />
        </button>
        <button onClick={cycleLayer} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90 relative`}>
          <Layers size={15} className="stroke-[2.2]" />
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[8px] font-black border-2 border-white dark:border-slate-900">{tileIndex + 1}</span>
        </button>
        {onShareTrip && (
          <button onClick={onShareTrip} className={`${btnBase} w-9 h-9 !bg-gradient-to-tr !from-emerald-500 !to-teal-500 !text-white border-none shadow-emerald-500/20`}>
            <Share2 size={15} className="stroke-[2.2]" />
          </button>
        )}
      </div>
    </>
  );
}

export { TILE_LAYERS, LABEL_OVERLAY_URL, TRANSPORT_OVERLAY_URL };

