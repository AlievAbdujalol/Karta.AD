import { useState, useEffect } from 'react';
import { TripLog, Route } from '@/api/entities';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid
} from 'recharts';
import { BarChart2, Clock } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs font-semibold text-gray-800">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

export default function TripCharts() {
  const { t } = useLanguage();
  const tripKey = t('admin.charts.tripCountKey');
  const [routeData, setRouteData] = useState([]);
  const [hourData, setHourData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [trips, routes] = await Promise.all([
        TripLog.list('-created_at', 1000),
        Route.list(),
      ]);

      const countMap = {};
      const hourMap = {};

      for (const trip of trips) {
        if (trip.route_id) {
          countMap[trip.route_id] = (countMap[trip.route_id] || 0) + 1;
        }
        if (trip.created_at) {
          const hour = new Date(trip.created_at).getHours();
          hourMap[hour] = (hourMap[hour] || 0) + 1;
        }
      }

      const rData = routes
        .map(r => ({
          name: `#${r.number}`,
          [tripKey]: countMap[r.id] || 0,
          fullName: r.name || r.number,
        }))
        .sort((a, b) => b[tripKey] - a[tripKey])
        .slice(0, 8);

      const hData = Array.from({ length: 24 }, (_, h) => ({
        час: `${String(h).padStart(2, '0')}:00`,
        [tripKey]: hourMap[h] || 0,
      }));

      setRouteData(rData);
      setHourData(hData);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const hasData = routeData.some(r => r[tripKey] > 0);
  if (!hasData) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-400 text-sm">
        <BarChart2 size={32} className="mx-auto mb-2 opacity-30" />
        {t('admin.charts.noData')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <BarChart2 size={15} className="text-blue-500" />
          {t('admin.charts.popularityTitle')}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={routeData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={tripKey} fill="#3B82F6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-2">
          {routeData.slice(0, 3).map((r, i) => (
            <span key={i} className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {i + 1}. {r.name}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <Clock size={15} className="text-indigo-500" />
          {t('admin.charts.densityTitle')}
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={hourData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="час" tick={{ fontSize: 10 }} interval={2} tickFormatter={v => v.replace(':00', t('admin.charts.hoursAbbreviation'))} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey={tripKey} stroke="#6366F1" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#6366F1' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
