import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, X } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

// Fix leaflet default icon
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const pinIcon = L.divIcon({
  html: `<div style="
    width: 36px; height: 36px;
    background: #2563eb;
    border: 3px solid white;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 4px 12px rgba(37,99,235,0.5);
    display: flex; align-items: center; justify-content: center;
  "><div style="
    width: 10px; height: 10px;
    background: white;
    border-radius: 50%;
    transform: rotate(45deg);
  "></div></div>`,
  className: '',
  iconAnchor: [18, 36],
  iconSize: [36, 36],
});

// Компонент-слушатель кликов по карте
function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Центрирует карту при изменении center/zoom
function MapCenterUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center[0], center[1], zoom]);
  return null;
}

/**
 * MapLocationPicker
 * Props:
 *  - value: { lat, lng } | null
 *  - onChange: (coords: { lat, lng }) => void
 *  - center?: [lat, lng]  — начальная позиция карты
 *  - zoom?: number
 *  - height?: string CSS value, default '260px'
 */
export default function MapLocationPicker({
  value,
  onChange,
  center = [38.5581, 68.7738],
  zoom = 12,
  height = '260px',
}) {
  const { t } = useLanguage();
  const [picked, setPicked] = useState(value ? { lat: value.lat, lng: value.lng } : null);

  // Синхронизируем если пришёл внешний value
  useEffect(() => {
    if (value?.lat && value?.lng) {
      setPicked({ lat: value.lat, lng: value.lng });
    }
  }, [value?.lat, value?.lng]);

  const handlePick = (coords) => {
    const rounded = {
      lat: Math.round(coords.lat * 1e6) / 1e6,
      lng: Math.round(coords.lng * 1e6) / 1e6,
    };
    setPicked(rounded);
    onChange(rounded);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setPicked(null);
    onChange({ lat: '', lng: '' });
  };

  /** @type {[number, number]} */
  const mapCenter = picked ? [picked.lat, picked.lng] : [center[0], center[1]];

  return (
    <div className="space-y-2">
      {/* Инструкция */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
          <MapPin size={12} />
          {t('admin.mapPicker.clickInstruction')}
        </p>
        {picked && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
          >
            <X size={11} /> {t('admin.mapPicker.clearButton')}
          </button>
        )}
      </div>

      {/* Карта */}
      <div
        className="rounded-xl overflow-hidden border-2 border-blue-100 shadow-sm cursor-crosshair"
        style={{ height }}
      >
        <MapContainer
          center={mapCenter}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          <ClickHandler onPick={handlePick} />
          <MapCenterUpdater center={mapCenter} zoom={zoom} />
          {picked && (
            <Marker
              position={[picked.lat, picked.lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend(e) {
                  handlePick(e.target.getLatLng());
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Показываем выбранные координаты */}
      {picked ? (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <Navigation size={13} className="text-blue-500 flex-shrink-0" />
          <div className="flex gap-4 text-xs font-mono text-blue-700">
            <span>{t('admin.mapPicker.latAbbr')} <strong>{picked.lat.toFixed(6)}</strong></span>
            <span>{t('admin.mapPicker.lngAbbr')} <strong>{picked.lng.toFixed(6)}</strong></span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-400 text-center py-1">
          {t('admin.mapPicker.noLocation')}
        </div>
      )}
    </div>
  );
}
