import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';

export default function MiniMap({ center, route, userPos, heading }){
  if(!center) return null;
  const icon = L.divIcon({ html:`<div style="width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #fff;transform:rotate(${heading||0}deg)"></div>`, className:'', iconSize:[10,10], iconAnchor:[5,5]});
  return (
    <div className="w-[92px] h-[92px] rounded-full overflow-hidden border-2 border-white dark:border-slate-700 shadow-xl bg-slate-200">
      <MapContainer center={center} zoom={13} style={{height:'100%', width:'100%'}} zoomControl={false} dragging={false} attributionControl={false} doubleClickZoom={false} scrollWheelZoom={false}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {route?.geometry && <Polyline positions={route.geometry} color="#22c55e" weight={3} />}
        {userPos && <Marker position={userPos} icon={icon} />}
      </MapContainer>
    </div>
  );
}
