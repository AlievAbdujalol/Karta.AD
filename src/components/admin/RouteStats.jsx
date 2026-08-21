import { useState, useEffect } from 'react';
import { Route, TripLog, Review } from '@/api/entities';
import { BarChart2, Star, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

export default function RouteStats() {
  const { t } = useLanguage();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [routes, trips, reviews] = await Promise.all([
        Route.list(),
        TripLog.list('-created_at', 1000),
        Review.list('-created_at', 1000),
      ]);

      const tripCounts = {};
      for (const t of trips) {
        tripCounts[t.route_id] = (tripCounts[t.route_id] || 0) + 1;
      }

      const reviewData = {};
      for (const r of reviews) {
        if (!reviewData[r.route_id]) {
          reviewData[r.route_id] = { count: 0, total: 0 };
        }
        const avg = ((r.cleanliness || 0) + (r.politeness || 0) + (r.punctuality || 0)) / 3;
        reviewData[r.route_id].count += 1;
        reviewData[r.route_id].total += avg;
      }

      const data = routes.map(r => ({
        id: r.id,
        number: r.number,
        name: r.name || '',
        type: r.type,
        color: r.color || '#1565C0',
        trips: tripCounts[r.id] || 0,
        rating: reviewData[r.id]?.count ? (reviewData[r.id].total / reviewData[r.id].count).toFixed(1) : '—',
        reviews: reviewData[r.id]?.count || 0,
        stops: r.stops?.length || 0,
      })).sort((a, b) => b.trips - a.trips);

      setStats(data);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats.length) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm text-center text-gray-400 text-sm">
        <BarChart2 size={28} className="mx-auto mb-2 opacity-30" />
        {t('admin.stats.noData')}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
        <TrendingUp size={15} className="text-blue-500" />
        {t('admin.stats.title')}
      </h3>
      <div className="space-y-2">
        {stats.map(route => (
          <div key={route.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <span
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: route.color }}
            >
              #{route.number}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {route.name || t('admin.stats.routeDefaultName')}
              </p>
              <p className="text-[10px] text-gray-400">
                {route.type === 'bus' ? t('admin.stats.busLabel') : t('admin.stats.minibusLabel')} · {route.stops} {t('admin.stats.stopsLabel')}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="text-center">
                <p className="font-bold text-blue-600">{route.trips}</p>
                <p className="text-[9px] text-gray-400">{t('admin.stats.tripsLabel')}</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-amber-600 flex items-center gap-0.5">
                  {route.rating} <Star size={9} className="fill-amber-400 text-amber-400" />
                </p>
                <p className="text-[9px] text-gray-400">({route.reviews})</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
