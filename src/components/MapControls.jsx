import { Layers, Navigation, Crosshair } from 'lucide-react';
import { useMap } from 'react-leaflet';

function LocateButton() {
  const map = useMap();
  const handleLocate = () => {
    navigator.geolocation?.getCurrentPosition(pos => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
    });
  };
  return (
    <button
      onClick={handleLocate}
      className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50 transition"
      title="Моё местоположение"
    >
      <Crosshair size={18} />
    </button>
  );
}

export function MapRightControls() {
  return (
    <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
      <button className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50 transition" title="Слои">
        <Layers size={18} />
      </button>
      <button className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50 transition" title="Компас">
        <Navigation size={18} />
      </button>
      <LocateButton />
    </div>
  );
}