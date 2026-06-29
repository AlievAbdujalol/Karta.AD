import { Layers, Crosshair, Plus, Minus } from 'lucide-react';
import { useMap } from 'react-leaflet';

const TILE_LAYERS = [
  { label: 'Стандарт', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' },
  { label: 'Спутник', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { label: 'Ночная', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
];

export default function MapControls({ tileIndex, setTileIndex }) {
  const map = useMap();

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

  const btnClass = "w-10 h-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full shadow-[0_4px_14px_rgba(15,23,42,0.06)] flex items-center justify-center border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none";

  return (
    <div 
      className="absolute right-4 top-1/2 -translate-y-1/2 z-[999] flex flex-col gap-2.5 pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 1. Locate (Местоположение) */}
      <button
        onClick={locate}
        className={`${btnClass} !bg-blue-600 hover:!bg-blue-700 !text-white border-blue-500/20 shadow-blue-600/10`}
        title="Моё местоположение"
      >
        <Crosshair size={18} className="stroke-[2.2]" />
      </button>

      {/* 2. Zoom in (Масштаб +) */}
      <button
        onClick={() => map.zoomIn()}
        className={btnClass}
        title="Приблизить"
      >
        <Plus size={18} className="stroke-[2.2]" />
      </button>

      {/* 3. Zoom out (Масштаб -) */}
      <button
        onClick={() => map.zoomOut()}
        className={btnClass}
        title="Отдалить"
      >
        <Minus size={18} className="stroke-[2.2]" />
      </button>

      {/* 4. Layers (Слои карты) */}
      <button
        onClick={cycleLayer}
        className={`${btnClass} relative`}
        title={`Слой: ${TILE_LAYERS[tileIndex].label}`}
      >
        <Layers size={18} className="stroke-[2.2]" />
        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-[8px] font-black border border-white dark:border-slate-900">
          {tileIndex + 1}
        </span>
      </button>
    </div>
  );
}

export { TILE_LAYERS };
