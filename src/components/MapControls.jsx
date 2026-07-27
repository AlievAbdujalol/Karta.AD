import { Layers, Crosshair, Plus, Minus } from 'lucide-react';
import { useMap } from 'react-leaflet';
import { useLanguage } from '@/lib/useLanguage';

const TILE_LAYERS = [
  { labelKey: 'mapControls.layerStandard', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' },
  { labelKey: 'mapControls.layerSatellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { labelKey: 'mapControls.layerNight', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
];

export default function MapControls({ tileIndex, setTileIndex }) {
  const map = useMap();
  const { t } = useLanguage();

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 16),
      (err) => console.log('Location error:', err),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const cycleLayer = () => {
    setTileIndex((i) => (i + 1) % TILE_LAYERS.length);
  };

  const btnClass = "w-10 h-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.12)] flex items-center justify-center border border-slate-200/60 dark:border-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none";

  return (
    <div 
      className="absolute right-4 top-1/2 -translate-y-1/2 z-[999] flex flex-col gap-2.5 pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 1. Locate */}
      <button
        onClick={locate}
        className={`${btnClass} !bg-gradient-to-tr !from-emerald-600 !to-teal-500 hover:!from-emerald-700 hover:!to-teal-600 !text-white border-none shadow-emerald-500/20`}
        title={t('mapControls.myLocation')}
      >
        <Crosshair size={18} className="stroke-[2.2]" />
      </button>

      {/* 2. Zoom in */}
      <button
        onClick={() => map.zoomIn()}
        className={btnClass}
        title={t('mapControls.zoomIn')}
      >
        <Plus size={18} className="stroke-[2.2]" />
      </button>

      {/* 3. Zoom out */}
      <button
        onClick={() => map.zoomOut()}
        className={btnClass}
        title={t('mapControls.zoomOut')}
      >
        <Minus size={18} className="stroke-[2.2]" />
      </button>

      {/* 4. Layers */}
      <button
        onClick={cycleLayer}
        className={`${btnClass} relative`}
        title={`${t('mapControls.layerLabel')} ${t(TILE_LAYERS[tileIndex].labelKey)}`}
      >
        <Layers size={18} className="stroke-[2.2]" />
        <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-600 text-white rounded-full flex items-center justify-center text-[9px] font-black border-2 border-white dark:border-slate-900 shadow-sm">
          {tileIndex + 1}
        </span>
      </button>
    </div>
  );
}

export { TILE_LAYERS };
