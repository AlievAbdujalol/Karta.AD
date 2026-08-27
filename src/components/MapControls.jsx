import { Layers, Crosshair, Plus, Minus, Navigation, Share2 } from 'lucide-react';
import { useMap } from 'react-leaflet';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';

const TILE_LAYERS = [
  { labelKey: 'mapControls.layerStandard', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', isHybrid: false },
  { labelKey: 'mapControls.layerHybrid', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', isHybrid: true },
  { labelKey: 'mapControls.layerOsm', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', isHybrid: false },
  { labelKey: 'mapControls.layerEsriStreet', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', isHybrid: false },
  { labelKey: 'mapControls.layerEsriTopo', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', isHybrid: false },
  { labelKey: 'mapControls.layerGoogle', url: 'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', isHybrid: false },
  { labelKey: 'mapControls.layerGoogleSat', url: 'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', isHybrid: true },
  { labelKey: 'mapControls.layerGoogleHybrid', url: 'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', isHybrid: true },
];

const LABEL_OVERLAY_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/light_only_labels/{z}/{x}/{y}{r}.png';

export default function MapControls({ tileIndex, setTileIndex, finderActive, onFinderToggle, onShareTrip, rightOffset, isNavigating, onLocate }) {
  const map = useMap();
  const { t } = useLanguage();

  const locate = () => {
    if (onLocate) { onLocate(); return; }
    toast.loading(t('mapControls.myLocation') || 'Определяем местоположение…', { id: 'locate' });
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        toast.dismiss('locate');
        toast.success('Вы на карте');
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { animate: true, duration: 0.8 });
      },
      (err) => {
        toast.dismiss('locate');
        if (err.code === 1) toast.error('\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u0433\u0435\u043E\u043B\u043E\u043A\u0430\u0446\u0438\u0438 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435');
        else if (err.code === 2) toast.error('\u0413\u0435\u043E\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430');
        else toast.error('\u0413\u0435\u043E\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u0438\u0441\u0442\u0435\u043A\u043B\u0430');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const cycleLayer = () => setTileIndex((i) => (i + 1) % TILE_LAYERS.length);

  const btnBase = "flex items-center justify-center rounded-2xl shadow-[0_4px_16px_rgba(15,23,42,0.1)] border border-slate-200/60 dark:border-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none backdrop-blur-xl";

  return (
    <>
      {/* ===== DESKTOP: Right side vertical ===== */}
      <div
        className={`hidden md:flex absolute top-1/2 -translate-y-1/2 z-[999] flex-col gap-2.5 pointer-events-auto transition-all duration-300`}
        style={{ right: `${(rightOffset || 0) + 16}px` }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!isNavigating && (
          <button onClick={() => onFinderToggle?.()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90 ${finderActive ? '!bg-violet-600 !text-white border-violet-400 shadow-violet-500/30' : ''}`} title={t('routeFinder.button')}>
            <Navigation size={18} className="stroke-[2.2]" />
          </button>
        )}
        <button onClick={locate} className={`${btnBase} w-10 h-10 !bg-gradient-to-tr !from-emerald-600 !to-teal-500 hover:!from-emerald-700 hover:!to-teal-600 !text-white border-none shadow-emerald-500/20`} title={t('mapControls.myLocation')}>
          <Crosshair size={18} className="stroke-[2.2]" />
        </button>
        <button onClick={() => map.zoomIn()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90`} title={t('mapControls.zoomIn')}>
          <Plus size={18} className="stroke-[2.2]" />
        </button>
        <button onClick={() => map.zoomOut()} className={`${btnBase} w-10 h-10 bg-white/90 dark:bg-slate-900/90`} title={t('mapControls.zoomOut')}>
          <Minus size={18} className="stroke-[2.2]" />
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
        className="md:hidden absolute right-3 bottom-[90px] z-[999] flex flex-col gap-1.5 pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!isNavigating && (
          <button onClick={() => onFinderToggle?.()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90 ${finderActive ? '!bg-violet-600 !text-white border-violet-400 shadow-violet-500/30' : ''}`}>
            <Navigation size={15} className="stroke-[2.2]" />
          </button>
        )}
        <button onClick={locate} className={`${btnBase} w-9 h-9 !bg-gradient-to-tr !from-emerald-600 !to-teal-500 !text-white border-none shadow-emerald-500/20`}>
          <Crosshair size={15} className="stroke-[2.2]" />
        </button>
        <button onClick={() => map.zoomIn()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90`}>
          <Plus size={15} className="stroke-[2.2]" />
        </button>
        <button onClick={() => map.zoomOut()} className={`${btnBase} w-9 h-9 bg-white/90 dark:bg-slate-900/90`}>
          <Minus size={15} className="stroke-[2.2]" />
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

export { TILE_LAYERS, LABEL_OVERLAY_URL };
