import { useState, useEffect } from 'react';
import { City, Route, Vehicle } from '@/api/entities';
import { supabase } from '@/api/supabase';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Building2, Map, Users, TrendingUp, Car, Package } from 'lucide-react';
import CitiesManager from '@/components/admin/CitiesManager';
import RouteStats from '@/components/admin/RouteStats';
import TripCharts from '@/components/admin/TripCharts';
import RoutesManager from '@/components/admin/RoutesManager';
import DriversManager from '@/components/admin/DriversManager';
import VehiclesManager from '@/components/admin/VehiclesManager';
import TaxiAdmin from '@/components/admin/TaxiAdmin';
import DeliveryAdmin from '@/components/admin/DeliveryAdmin';

import RouteMapEditor from '@/components/admin/RouteMapEditor';
import { Link } from 'react-router-dom';

export default function AdminPanel() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [tab, setTab] = useState('cities');
  const [stats, setStats] = useState({ cities: 0, routes: 0, active: 0, pending: 0 });
  const [taxiDrivers, setTaxiDrivers] = useState([]);
  const [deliveryKeys, setDeliveryKeys] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      City.list(),
      Route.list(),
      Vehicle.filter({ is_active: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).not('driver_status', 'is', null).eq('driver_status', 'pending'),
    ]).then(([cities, routes, vehicles, { count }]) => {
      setStats({
        cities: cities.length,
        routes: routes.length,
        active: vehicles.length,
        pending: count || 0,
      });
    });
    supabase.from('taxi_drivers').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setTaxiDrivers(data);
    });
    supabase.from('delivery_api_keys').select('id', { count: 'exact', head: true }).then(({ count }) => {
      setDeliveryKeys(Array(count || 0).fill(0));
    });
  }, [user?.id]);

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
    { id: 'map', label: t('admin.tabMap'), icon: Map },
    { id: 'stats', label: t('admin.tabAnalytics'), icon: TrendingUp },
    { id: 'cities', label: t('cities'), icon: Building2 },
    { id: 'routes', label: t('routes'), icon: Map },
    { id: 'drivers', label: t('drivers'), icon: Users },
    { id: 'vehicles', label: t('admin.tabVehicles'), icon: Map },
    { id: 'taxi', label: 'Такси', icon: Car },
    { id: 'delivery', label: 'Доставка', icon: Package },
  ];

  const statCards = [
    { label: t('cities'), value: stats.cities, bg: 'bg-blue-600' },
    { label: t('totalRoutes'), value: stats.routes, bg: 'bg-indigo-600' },
    { label: t('activeVehicles'), value: stats.active, bg: 'bg-green-600' },
    { label: 'Такси', value: taxiDrivers.length, bg: 'bg-amber-500' },
    { label: 'Доставка', value: deliveryKeys.length, bg: 'bg-emerald-500' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statCards.map(s => (
            <div key={s.label} className={`${s.bg} text-white rounded-2xl p-4`}>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-xs opacity-80 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100 overflow-x-auto scrollbar-hide">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={15} />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>

        {tab === 'stats' && <div className="space-y-4"><TripCharts /><RouteStats /></div>}
        {tab === 'cities' && <CitiesManager />}
        {tab === 'routes' && <RoutesManager />}
        {tab === 'drivers' && <DriversManager />}
        {tab === 'vehicles' && <VehiclesManager />}
        {tab === 'map' && <RouteMapEditor />}
        {tab === 'taxi' && <TaxiAdmin />}
        {tab === 'delivery' && <DeliveryAdmin />}
      </div>
    </div>
  );
}
