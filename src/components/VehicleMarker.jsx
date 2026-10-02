import { useEffect, useRef, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Simple vehicle icon generator
const createIcon = (color) => L.divIcon({
  html: `<div style="
    background:${color};
    border-radius:50%;
    width:16px;
    height:16px;
    border:2px solid white;
    box-shadow:0 0 4px rgba(0,0,0,0.3);
  "></div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function VehicleMarker({ vehicle, color = '#1565c0' }) {
  const [pos, setPos] = useState([vehicle.lat, vehicle.lng]);
  const currentRef = useRef([vehicle.lat, vehicle.lng]);
  const rafRef = useRef(null);

  useEffect(() => {
    const targetPos = [vehicle.lat, vehicle.lng];
    const startPos = [...currentRef.current];
    const startPerf = performance.now();
    const DURATION = 1000; // 1 second animation

    const animate = (now) => {
      const elapsed = now - startPerf;
      const t = Math.min(elapsed / DURATION, 1);
      
      // Linear interpolation
      const nextPos = [
        startPos[0] + (targetPos[0] - startPos[0]) * t,
        startPos[1] + (targetPos[1] - startPos[1]) * t,
      ];
      
      currentRef.current = nextPos;
      setPos(nextPos);
      
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [vehicle.lat, vehicle.lng]);

  return (
    <Marker position={pos} icon={createIcon(color)}>
      <Popup>
        <div className="text-xs font-bold">
          {vehicle.route_number} | Speed: {Math.round(vehicle.speed || 0)} km/h
        </div>
      </Popup>
    </Marker>
  );
}
