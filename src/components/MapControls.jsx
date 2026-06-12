import { Layers, Crosshair, Compass } from 'lucide-react';
import { useState } from 'react';
import { useMap } from 'react-leaflet';

const TILE_LAYERS = [
  { label: 'Стандарт', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' },
  { label: 'Спутник', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { label: 'Ночная', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
];

const btnStyle = {
  width: 40,
  height: 40,
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  cursor: 'pointer',
};

export default function MapControls({ tileIndex, setTileIndex }) {
  const map = useMap();
  const [bearing, setBearing] = useState(0);

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(pos =>
      map.setView([pos.coords.latitude, pos.coords.longitude], 16)
    );
  };

  const cycleLayer = () => {
    setTileIndex(i => (i + 1) % TILE_LAYERS.length);
  };

  return (
    <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Layers */}
      <button
        onClick={cycleLayer}
        style={{ ...btnStyle, position: 'relative' }}
        title={`Слой: ${TILE_LAYERS[tileIndex].label}`}
      >
        <Layers size={17} color="#444" />
        <span style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 7, fontWeight: 800, color: '#1565c0' }}>
          {tileIndex + 1}
        </span>
      </button>

      {/* Compass */}
      <button
        onClick={() => { const next = (bearing + 45) % 360; setBearing(next); }}
        style={btnStyle}
        title="Повернуть"
      >
        <Compass size={17} color="#444" style={{ transform: `rotate(${bearing}deg)`, transition: 'transform 0.3s' }} />
      </button>

      {/* Zoom in */}
      <button
        onClick={() => map.zoomIn()}
        style={{ ...btnStyle, fontSize: 18, fontWeight: 700, color: '#444', lineHeight: 1 }}
        title="Приближение"
      >
        +
      </button>

      {/* Zoom out */}
      <button
        onClick={() => map.zoomOut()}
        style={{ ...btnStyle, fontSize: 22, fontWeight: 300, color: '#444', lineHeight: 0.7 }}
        title="Отдаление"
      >
        −
      </button>

      {/* Locate */}
      <button
        onClick={locate}
        style={{ ...btnStyle, background: '#1e56d0', boxShadow: '0 2px 12px rgba(30,86,208,0.35)' }}
        title="Моё местоположение"
      >
        <Crosshair size={17} color="#fff" />
      </button>
    </div>
  );
}

export { TILE_LAYERS };
