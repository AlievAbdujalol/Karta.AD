import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Building2, Map, Users, TrendingUp, Download } from 'lucide-react';
import CitiesManager from '@/components/admin/CitiesManager';
import RouteStats from '@/components/admin/RouteStats';
import TripCharts from '@/components/admin/TripCharts';
import RoutesManager from '@/components/admin/RoutesManager';
import DriversManager from '@/components/admin/DriversManager';
import VehiclesManager from '@/components/admin/VehiclesManager';
import ExportStats from '@/components/admin/ExportStats';
import RouteMapEditor from '@/components/admin/RouteMapEditor';
import { Link } from 'react-router-dom';

export default function AdminPanel() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [tab, setTab] = useState('cities');
  const [stats, setStats] = useState({ cities: 0, routes: 0, active: 0, pending: 0 });

  useEffect(() => {
    Promise.all([
      base44.entities.City.list(),
      base44.entities.Route.list(),
      base44.entities.Vehicle.filter({ is_active: true }),
      base44.entities.User.filter({ role: 'driver', driver_status: 'pending' }),
    ]).then(([cities, routes, vehicles, pending]) => {
      setStats({
        cities: cities.length,
        routes: routes.length,
        active: vehicles.length,
        pending: pending.length,
      });
    });
  }, []);

  if (!user) return <div className="p-8 text-center text-gray-500">{t('loading')}</div>;

  if (user.role !== 'admin') return (
    <div className="p-8 text-center space-y-4">
      <div className="text-5xl">🔒</div>
      <p className="text-gray-600 text-sm">{t('role')}: <strong>{t('admin')}</strong></p>
      <Link to="/profile" className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
        {t('editProfile')}
      </Link>
    </div>
  );

  const tabs = [
    { id: 'map', label: 'Карта', icon: Map },
    { id: 'stats', label: 'Аналитика', icon: TrendingUp },
    { id: 'export', label: 'Экспорт', icon: Download },
    { id: 'cities', label: t('cities'), icon: Building2 },
    { id: 'routes', label: t('routes'), icon: Map },
    { id: 'drivers', label: t('drivers'), icon: Users },
    { id: 'vehicles', label: 'Транспорт', icon: Map },
  ];

  const statCards = [
    { label: t('cities'), value: stats.cities, bg: 'bg-blue-600' },
    { label: t('totalRoutes'), value: stats.routes, bg: 'bg-indigo-600' },
    { label: t('activeVehicles'), value: stats.active, bg: 'bg-green-600' },
    { label: t('waitingApproval'), value: stats.pending, bg: 'bg-amber-500' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map(s => (
            <div key={s.label} className={`${s.bg} text-white rounded-2xl p-4`}>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-xs opacity-80 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'stats' && <div className="space-y-4"><TripCharts /><RouteStats /></div>}
        {tab === 'cities' && <CitiesManager />}
        {tab === 'routes' && <RoutesManager />}
        {tab === 'drivers' && <DriversManager />}
        {tab === 'vehicles' && <VehiclesManager />}
        {tab === 'export' && <ExportStats />}
        {tab === 'map' && <RouteMapEditor />}
      </div>
    </div>
  );
}