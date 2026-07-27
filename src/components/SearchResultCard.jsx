import { useState, useEffect } from 'react';
import { X, Bus, MapPin, Navigation, Gauge } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { useLanguage } from '@/lib/useLanguage';

export default function SearchResultCard({ result, onClose }) {
  const { t } = useLanguage();
  const [extra, setExtra] = useState(null);
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    if (!result) return;

    if (result._type === 'stop') {
      supabase.from('stops').select('*, routes!inner(number, name, color, type)').eq('id', result.id)
        .then(({ data: stops }) => {
          if (stops?.length) {
            const uniqueRoutes = [];
            const seen = new Set();
            stops.forEach(s => {
              if (s.routes && !seen.has(s.routes.number)) {
                seen.add(s.routes.number);
                uniqueRoutes.push(s.routes);
              }
            });
            setExtra(uniqueRoutes);
          }
        }).catch(() => {});
    } else if (result._type === 'route') {
      supabase.from('vehicles').select('*').eq('route_id', result.id).eq('is_active', true)
        .then(({ data }) => setExtra(data || [])).catch(() => {});
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const R = 6371;
          const dLat = (result.lat - pos.coords.latitude) * Math.PI / 180;
          const dLng = (result.lng - pos.coords.longitude) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(pos.coords.latitude * Math.PI / 180) * Math.cos(result.lat * Math.PI / 180) * Math.sin(dLng/2)**2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          setDistance(Math.round(R * c * 1000));
        },
        () => {},
        { timeout: 3000 }
      );
    }
  }, [result]);

  if (!result) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1001] w-[calc(100%-32px)] max-w-md">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/60 dark:border-slate-700/80 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {result._type === 'route' && <Bus size={16} className="text-blue-500 shrink-0" />}
              {result._type === 'stop' && <MapPin size={16} className="text-emerald-500 shrink-0" />}
              {result._type === 'vehicle' && <Navigation size={16} className="text-purple-500 shrink-0" />}
              {result._type === 'address' && <MapPin size={16} className="text-amber-500 shrink-0" />}
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {result._type === 'route' && t('searchResult.typeRoute')}
                {result._type === 'stop' && t('searchResult.typeStop')}
                {result._type === 'vehicle' && t('searchResult.typeVehicle')}
                {result._type === 'address' && t('searchResult.typeAddress')}
              </span>
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {result._type === 'route' && `#${result.number}`}
              {result._type === 'route' && result.name ? ` ${result.name}` : ''}
              {result._type === 'stop' && result.name}
              {result._type === 'vehicle' && (result.driver_name || `№${result.vehicle_number || ''}`)}
              {result._type === 'address' && result.name}
            </h3>

            {result._type === 'route' && (
              <p className="text-xs text-slate-500 mt-0.5">{result.type === 'bus' ? t('searchResult.busLabel') : t('searchResult.minibusLabel')} · {result.city_name || ''}</p>
            )}
            {result._type === 'route' && extra?.length > 0 && (
              <p className="text-[11px] text-emerald-600 mt-0.5 flex items-center gap-1">
                <Bus size={11} /> {extra.length} {extra.length === 1 ? t('searchResult.vehicleSingular') : t('searchResult.vehiclePlural')} {t('searchResult.onLine')}
              </p>
            )}
            {result._type === 'address' && result.fullAddress && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{result.fullAddress}</p>
            )}
            {result._type === 'vehicle' && (
              <div className="flex flex-wrap gap-2 mt-1">
                {result.route_number && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">#{result.route_number}</span>}
                {result.vehicle_number && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">№{result.vehicle_number}</span>}
                {result.speed > 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Gauge size={10} />{Math.round(result.speed)} {t('speedUnit')}</span>}
              </div>
            )}
            {result._type === 'stop' && extra?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {extra.map((r, i) => (
                  <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: (r.color || '#1565C0') + '20', color: r.color || '#1565C0' }}>#{r.number}</span>
                ))}
              </div>
            )}

            {distance !== null && (
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <Navigation size={11} /> {distance < 1000 ? `${distance} м` : `${(distance / 1000).toFixed(1)} км`} {t('searchResult.fromYou')}
              </p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
