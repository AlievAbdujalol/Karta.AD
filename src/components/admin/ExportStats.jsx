import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, FileText, Loader2 } from 'lucide-react';

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
  const [loading, setLoading] = useState(null);

  const exportTrips = async () => {
    setLoading('trips');
    const trips = await base44.entities.TripLog.list('-created_date', 1000);
    const headers = [
      { key: 'created_date', label: 'Дата и время' },
      { key: 'route_number', label: 'Номер маршрута' },
      { key: 'route_name', label: 'Название маршрута' },
      { key: 'route_type', label: 'Тип' },
      { key: 'city_name', label: 'Город' },
      { key: 'user_id', label: 'ID пользователя' },
    ];
    const rows = trips.map(t => ({
      ...t,
      created_date: t.created_date ? new Date(t.created_date).toLocaleString('ru') : '',
    }));
    downloadCSV(toCSV(rows, headers), `trips_${new Date().toISOString().slice(0,10)}.csv`);
    setLoading(null);
  };

  const exportPopularRoutes = async () => {
    setLoading('routes');
    const [trips, routes] = await Promise.all([
      base44.entities.TripLog.list('-created_date', 1000),
      base44.entities.Route.list(),
    ]);

    // Count trips per route
    const countMap = {};
    for (const t of trips) {
      countMap[t.route_id] = (countMap[t.route_id] || 0) + 1;
    }

    const rows = routes
      .map(r => ({
        route_number: r.number,
        route_name: r.name || '',
        route_type: r.type === 'bus' ? 'Автобус' : 'Маршрутка',
        stops_count: r.stops?.length || 0,
        trip_count: countMap[r.id] || 0,
      }))
      .sort((a, b) => b.trip_count - a.trip_count);

    const headers = [
      { key: 'route_number', label: 'Номер маршрута' },
      { key: 'route_name', label: 'Название' },
      { key: 'route_type', label: 'Тип' },
      { key: 'stops_count', label: 'Кол-во остановок' },
      { key: 'trip_count', label: 'Количество поездок' },
    ];
    downloadCSV(toCSV(rows, headers), `popular_routes_${new Date().toISOString().slice(0,10)}.csv`);
    setLoading(null);
  };

  const exportReviews = async () => {
    setLoading('reviews');
    const reviews = await base44.entities.Review.list('-created_date', 1000);
    const headers = [
      { key: 'created_date', label: 'Дата' },
      { key: 'route_number', label: 'Маршрут' },
      { key: 'driver_name', label: 'Водитель' },
      { key: 'vehicle_number', label: 'Номер ТС' },
      { key: 'cleanliness', label: 'Чистота' },
      { key: 'politeness', label: 'Вежливость' },
      { key: 'punctuality', label: 'Пунктуальность' },
      { key: 'comment', label: 'Комментарий' },
    ];
    const rows = reviews.map(r => ({
      ...r,
      created_date: r.created_date ? new Date(r.created_date).toLocaleString('ru') : '',
    }));
    downloadCSV(toCSV(rows, headers), `reviews_${new Date().toISOString().slice(0,10)}.csv`);
    setLoading(null);
  };

  const exports = [
    {
      id: 'trips',
      title: 'Журнал поездок',
      desc: 'Все поездки пассажиров с датами, маршрутами и городами',
      action: exportTrips,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      iconColor: 'text-blue-500',
    },
    {
      id: 'routes',
      title: 'Популярные маршруты',
      desc: 'Рейтинг маршрутов по количеству поездок',
      action: exportPopularRoutes,
      color: 'bg-green-50 border-green-200 text-green-700',
      iconColor: 'text-green-500',
    },
    {
      id: 'reviews',
      title: 'Отзывы пассажиров',
      desc: 'Все отзывы с оценками по чистоте, вежливости и пунктуальности',
      action: exportReviews,
      color: 'bg-purple-50 border-purple-200 text-purple-700',
      iconColor: 'text-purple-500',
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Файлы экспортируются в формате CSV (UTF-8). Открываются в Excel, Google Sheets и других табличных редакторах.
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
              {loading === ex.id ? 'Загрузка...' : 'Скачать'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}