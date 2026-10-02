import { useState, useEffect } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '@/api/supabase';

const shopIcon = L.divIcon({
  html: `<div style="width:30px;height:30px;border-radius:10px;background:#7c3aed;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:15px;">🏪</div>`,
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const esc = (s) => String(s ?? '').replace(/[<>&"]/g, '');

/**
 * Публичные точки бизнесов (магазины с адресом на карте).
 * Данные: RPC get_public_businesses (только active + координаты).
 */
export default function BusinessMarkers({ onSelect }) {
  const [shops, setShops] = useState([]);

  useEffect(() => {
    let alive = true;
    supabase.rpc('get_public_businesses').then(({ data, error }) => {
      if (alive && !error && data) setShops(data);
    });
    return () => { alive = false; };
  }, []);

  if (!shops.length) return null;

  return (
    <>
      {shops.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={shopIcon}
          eventHandlers={onSelect ? { click: () => onSelect(s) } : undefined}
        >
          <Popup>
            <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 150 }}>
              <p style={{ fontWeight: 800, fontSize: 13, margin: '0 0 2px' }}>🏪 {esc(s.name)}</p>
              {s.address && <p style={{ fontSize: 12, color: '#475569', margin: '0 0 2px' }}>📍 {esc(s.city ? `${s.city}, ${s.address}` : s.address)}</p>}
              {s.phone && <p style={{ fontSize: 12, margin: 0 }}><a href={`tel:${esc(s.phone)}`}>{esc(s.phone)}</a></p>}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
