import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from 'recharts';
import { BarChart2, Clock } from 'lucide-react';

export default function TripCharts() {
  const [routeData, setRouteData] = useState([]);
  const [hourData, setHourData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [trips, routes] = await Promise.all([
        base44.entities.TripLog.list('-created_date', 1000),
        base44.entities.Route.list(),
      ]);

      // Routes popularity
      const countMap = {};
      const hourMap = {};

      for (const trip of trips) {
        // by route
        if (trip.route_id) {
          countMap[trip.route_id] = (countMap[trip.route_id] || 0) + 1;
        }
        // by hour
        if (trip.created_date) {
          const hour = new Date(trip.created_date).getHours();
          hourMap[hour] = (hourMap[hour] || 0) + 1;
        }
      }

      // Top 8 routes
      const rData = routes
        .map(r => ({
          name: `#${r.number}`,
          поездок: countMap[r.id] || 0,
          fullName: r.name || r.number,
        }))
        .sort((a, b) => b.поездок - a.поездок)
        .slice(0, 8);

      // 24h distribution
      const hData = Array.from({ length: 24 }, (_, h) => ({
        час: `${String(h).padStart(2, '0')}:00`,
        поездок: hourMap[h] || 0,
      }));

      setRouteData(rData);
      setHourData(hData);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const hasData = routeData.some(r => r.поездок > 0);

  if (!hasData) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-gray-400 text-sm">
        <BarChart2 size={36} className="mx-auto mb-3 text-gray-300" />
        Недостаточно данных для построения графиков.<br />
        Данные появятся после того, как пассажиры начнут просматривать маршруты.
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-semibold text-gray-700">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Routes bar chart */}
      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <BarChart2 size={15} className="text-blue-500" />
          Популярность маршрутов (топ-8)
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={routeData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="поездок" fill="#3B82F6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-2">
          {routeData.slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-full text-xs">
              <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : 'bg-amber-600'}`} />
              <span className="font-semibold text-blue-800">{r.name}</span>
              <span className="text-blue-500">{r.поездок} поезд.</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly distribution */}
      <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <Clock size={15} className="text-indigo-500" />
          Плотность поездок по времени суток
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={hourData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="час"
              tick={{ fontSize: 10 }}
              interval={2}
              tickFormatter={v => v.replace(':00', 'ч')}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="поездок"
              stroke="#6366F1"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: '#6366F1' }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-gray-400 text-center">
          Часы с наибольшей нагрузкой — пиковое время для управления транспортом
        </p>
      </div>
    </div>
  );
}