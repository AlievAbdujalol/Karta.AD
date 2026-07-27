import { useState, useEffect } from 'react';
import { TripLog } from '@/api/entities';
import { Bus, MapPin, Clock, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useLanguage } from '@/lib/useLanguage';

export default function TripHistory({ user }) {
  const { t } = useLanguage();
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    if (user?.id) {
      TripLog.filter({ user_id: user.id }, '-created_at').then(setTrips);
    }
  }, [user?.id]);

  if (trips.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
        <History size={24} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400">{t('tripHistory.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trips.map(trip => (
        <div key={trip.id} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: trip.route_color || '#1565C0' }}
          >
            #{trip.route_number}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">
              {trip.route_name || `${t('tripHistory.routeDefaultName')} #${trip.route_number}`}
            </p>
            <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
              <MapPin size={10} /><span>{trip.city_name || '—'}</span><span className="mx-1">·</span>
              <Bus size={10} /><span>{trip.route_type === 'minibus' ? t('tripHistory.minibusLabel') : t('tripHistory.busLabel')}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-gray-400 text-[11px] flex-shrink-0">
            <Clock size={11} />
            <span>{formatDistanceToNow(new Date(trip.created_at), { addSuffix: true, locale: ru })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
