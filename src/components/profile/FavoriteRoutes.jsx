import { FavoriteRoute } from '@/api/entities';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { useState, useEffect } from 'react';

export default function FavoriteRoutes() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    if (user?.id) {
      FavoriteRoute.filter({ user_id: user.id }).then(setFavorites);
    }
  }, [user?.id]);

  if (favorites.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
        <p className="text-sm text-gray-400">{t('favorites.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {favorites.map((item) => (
        <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: item.route_color || '#1565C0' }}
            >
              #{item.route_number}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">
                № {item.route_number} — {item.route_name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {item.city_name} · {item.route_type === 'minibus' ? t('favorites.minibusLabel') : t('favorites.busLabel')}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
