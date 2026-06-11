import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { History, Bus, MapPin, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function TripHistory({ user }) {
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    if (user?.id) {
      base44.entities.TripLog.filter({ user_id: user.id }, '-created_at').then(setTrips);
    }
  }, [user?.id]);

  if (trips.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <History size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">История поездок пуста</p>
        <p className="text-xs mt-1">Выбирайте маршруты на карте — они будут сохраняться здесь</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trips.map(trip => (
        <div key={trip.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: trip.route_color || '#1565C0' }}
          >
            #{trip.route_number}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm truncate">
              {trip.route_name || `Маршрут #${trip.route_number}`}
            </p>
            <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
              <MapPin size={10} />
              <span>{trip.city_name || '—'}</span>
              <span className="mx-1">·</span>
              <Bus size={10} />
              <span>{trip.route_type === 'minibus' ? 'Маршрутка' : 'Автобус'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-gray-400 text-[11px] flex-shrink-0">
            <Clock size={11} />
            <span>
              {formatDistanceToNow(new Date(trip.created_at), { addSuffix: true, locale: ru })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}