import { useState } from 'react';
import { TripLog, Route, Review } from '@/api/entities';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

function toCSV(rows, headers) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(h => escape(h.label)).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h.key])).join(','));
  }
  return lines.join('\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportStats() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(null);

  const exportTrips = async () => {
    setLoading('trips');
    const trips = await TripLog.list('-created_at', 1000);
    const headers = [
      { key: 'created_at', label: t('admin.export.dateHeader') },
      { key: 'route_number', label: t('admin.export.routeNumberHeader') },
      { key: 'route_name', label: t('admin.export.routeNameHeader') },
      { key: 'route_type', label: t('admin.export.typeHeader') },
      { key: 'city_name', label: t('admin.export.cityHeader') },
      { key: 'user_id', label: t('admin.export.userIdHeader') },
    ];
    const rows = trips.map(t => ({
      ...t,
      created_at: t.created_at ? new Date(t.created_at).toLocaleString('ru') : '',
    }));
    downloadCSV(toCSV(rows, headers), `trips_${new Date().toISOString().slice(0,10)}.csv`);
    setLoading(null);
  };

  const exportPopularRoutes = async () => {
    setLoading('routes');
    const [trips, routes] = await Promise.all([
      TripLog.list('-created_at', 1000),
      Route.list(),
    ]);

    const countMap = {};
    for (const t of trips) {
      countMap[t.route_id] = (countMap[t.route_id] || 0) + 1;
    }

    const rows = routes
      .map(r => ({
        route_number: r.number,
        route_name: r.name || '',
        route_type: r.type === 'bus' ? t('admin.export.busLabel') : t('admin.export.minibusLabel'),
        stops_count: r.stops?.length || 0,
        trip_count: countMap[r.id] || 0,
      }))
      .sort((a, b) => b.trip_count - a.trip_count);

    const headers = [
      { key: 'route_number', label: t('admin.export.routeNumberHeader') },
      { key: 'route_name', label: t('admin.export.routeNameShort') },
      { key: 'route_type', label: t('admin.export.typeHeader') },
      { key: 'stops_count', label: t('admin.export.stopsCountHeader') },
      { key: 'trip_count', label: t('admin.export.tripCountHeader') },
    ];
    downloadCSV(toCSV(rows, headers), `popular_routes_${new Date().toISOString().slice(0,10)}.csv`);
    setLoading(null);
  };

  const exportReviews = async () => {
    setLoading('reviews');
    const reviews = await Review.list('-created_at', 1000);
    const headers = [
      { key: 'created_at', label: t('admin.export.dateShortHeader') },
      { key: 'route_number', label: t('admin.export.routeShortHeader') },
      { key: 'driver_name', label: t('admin.export.driverNameHeader') },
      { key: 'vehicle_number', label: t('admin.export.vehicleNumberHeader') },
      { key: 'cleanliness', label: t('admin.export.cleanlinessHeader') },
      { key: 'politeness', label: t('admin.export.politenessHeader') },
      { key: 'punctuality', label: t('admin.export.punctualityHeader') },
      { key: 'comment', label: t('admin.export.commentHeader') },
    ];
    const rows = reviews.map(r => ({
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toLocaleString('ru') : '',
    }));
    downloadCSV(toCSV(rows, headers), `reviews_${new Date().toISOString().slice(0,10)}.csv`);
    setLoading(null);
  };

  const exports = [
    {
      id: 'trips',
      title: t('admin.export.tripsTitle'),
      desc: t('admin.export.tripsDesc'),
      action: exportTrips,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      iconColor: 'text-blue-500',
    },
    {
      id: 'routes',
      title: t('admin.export.routesTitle'),
      desc: t('admin.export.routesDesc'),
      action: exportPopularRoutes,
      color: 'bg-green-50 border-green-200 text-green-700',
      iconColor: 'text-green-500',
    },
    {
      id: 'reviews',
      title: t('admin.export.reviewsTitle'),
      desc: t('admin.export.reviewsDesc'),
      action: exportReviews,
      color: 'bg-purple-50 border-purple-200 text-purple-700',
      iconColor: 'text-purple-500',
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        {t('admin.export.fileFormatNote')}
      </p>
      {exports.map(ex => (
        <div key={ex.id} className={`border rounded-2xl p-4 ${ex.color}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileText size={20} className={`mt-0.5 flex-shrink-0 ${ex.iconColor}`} />
              <div>
                <p className="font-semibold text-sm">{ex.title}</p>
                <p className="text-xs opacity-70 mt-0.5">{ex.desc}</p>
              </div>
            </div>
            <button
              onClick={ex.action}
              disabled={loading !== null}
              className="flex items-center gap-1.5 bg-white border border-current px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-40 flex-shrink-0"
            >
              {loading === ex.id
                ? <Loader2 size={13} className="animate-spin" />
                : <Download size={13} />
              }
              {loading === ex.id ? t('admin.export.loading') : t('admin.export.downloadButton')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
