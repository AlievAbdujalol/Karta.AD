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
 * Данные: RPC get_public_businesses + get_public_sites (у сайтов — ссылка).
 */
export default function BusinessMarkers({ onSelect }) {
  const [shops, setShops] = useState([]);
  const [sites, setSites] = useState([]);

  useEffect(() => {
    let alive = true;
    supabase.rpc('get_public_businesses').then(({ data, error }) => {
      if (alive && !error && data) setShops(data);
    });
    supabase.rpc('get_public_sites').then(({ data, error }) => {
      if (alive && !error && data) setSites(data);
    });
    return () => { alive = false; };
  }, []);

  const siteBizIds = new Set(sites.map((s) => s.business_id));

  if (!shops.length && !sites.length) return null;

  return (
    <>
      {shops.filter((s) => !siteBizIds.has(s.id)).map((s) => (
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
      {sites.map((s) => (
        <Marker key={`site-${s.version_id}`} position={[s.lat, s.lng]} icon={shopIcon}>
          <Popup>
            <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 170 }}>
              <p style={{ fontWeight: 800, fontSize: 13, margin: '0 0 2px' }}>🏪 {esc(s.business_name)}</p>
              {s.address && <p style={{ fontSize: 12, color: '#475569', margin: '0 0 6px' }}>📍 {esc(s.address)}</p>}
              <div style={{ display: 'flex', gap: 6 }}>
                <a
                  href={`/s/${s.version_id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: 1, textAlign: 'center', background: '#7c3aed', color: '#fff', fontWeight: 800, fontSize: 12, padding: '7px 10px', borderRadius: 10, textDecoration: 'none' }}
                >
                  Открыть сайт
                </a>
                {s.phone && (
                  <a href={`tel:${esc(s.phone)}`} style={{ textAlign: 'center', background: '#f1f5f9', color: '#0f172a', fontWeight: 800, fontSize: 12, padding: '7px 10px', borderRadius: 10, textDecoration: 'none' }}>
                    📞
                  </a>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
