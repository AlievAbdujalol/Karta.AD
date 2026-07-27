import { useState, useEffect } from 'react';
import { FavoriteRoute } from '@/api/entities';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { Heart, HeartOff, Bus, MapPin } from 'lucide-react';

export default function FavoriteRoutes({ user: propUser }) {
  const { t } = useLanguage();
  const { user: contextUser } = useCurrentUser();
  const user = propUser || contextUser;
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    if (user?.id) {
      FavoriteRoute.filter({ user_id: user.id }).then(setFavorites);
    }
  }, [user?.id]);

  const remove = async (fav) => {
    await FavoriteRoute.delete(fav.id);
    setFavorites(f => f.filter(x => x.id !== fav.id));
  };

  if (favorites.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Heart size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">{t('admin.vehicles.noFavorites')}</p>
        <p className="text-xs mt-1">{t('admin.vehicles.noFavoritesHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {favorites.map(fav => (
        <div key={fav.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: fav.route_color || '#1565C0' }}
          >
            #{fav.route_number}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm truncate">
              {fav.route_name || t('admin.vehicles.routeDefaultName')}
            </p>
            <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
              <MapPin size={10} />
              <span>{fav.city_name || '—'}</span>
              <span className="mx-1">·</span>
              <Bus size={10} />
              <span>{fav.route_type === 'minibus' ? t('admin.vehicles.minibusLabel') : t('admin.vehicles.busLabel')}</span>
            </div>
          </div>
          <button onClick={() => remove(fav)} className="text-red-400 hover:text-red-600 transition-colors">
            <HeartOff size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
