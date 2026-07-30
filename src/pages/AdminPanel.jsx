import { useState, useEffect } from 'react';
import { City, Route, Vehicle } from '@/api/entities';
import { supabase } from '@/api/supabase';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Building2, Map, Users, TrendingUp, Car, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import CitiesManager from '@/components/admin/CitiesManager';
import RouteStats from '@/components/admin/RouteStats';
import TripCharts from '@/components/admin/TripCharts';
import RoutesManager from '@/components/admin/RoutesManager';
import DriversManager from '@/components/admin/DriversManager';
import VehiclesManager from '@/components/admin/VehiclesManager';

import RouteMapEditor from '@/components/admin/RouteMapEditor';
import { Link } from 'react-router-dom';

export default function AdminPanel() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [tab, setTab] = useState('cities');
  const [stats, setStats] = useState({ cities: 0, routes: 0, active: 0, pending: 0 });
  const [taxiDrivers, setTaxiDrivers] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      City.list(),
      Route.filter({ created_by_id: user.id }),
      Vehicle.filter({ is_active: true }),
      supabase.rpc('get_admin_driver_requests').then(({ data }) => data || []),
    ]).then(([cities, routes, vehicles, pending]) => {
      setStats({
        cities: cities.length,
        routes: routes.length,
        active: vehicles.length,
        pending: pending.length,
      });
    });
    supabase.from('taxi_drivers').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setTaxiDrivers(data);
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
  ];

  const statCards = [
    { label: t('cities'), value: stats.cities, bg: 'bg-blue-600' },
    { label: t('totalRoutes'), value: stats.routes, bg: 'bg-indigo-600' },
    { label: t('activeVehicles'), value: stats.active, bg: 'bg-green-600' },
    { label: 'Такси', value: taxiDrivers.length, bg: 'bg-amber-500' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
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
        {tab === 'taxi' && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Водители такси ({taxiDrivers.length})</h3>
            {taxiDrivers.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Нет зарегистрированных водителей</p>}
            {taxiDrivers.map(d => (
              <div key={d.id || d.user_id} className="bg-white rounded-2xl p-4 border border-gray-100 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm overflow-hidden">
                    {d.photo_url ? <img src={d.photo_url} alt="" className="w-full h-full object-cover" /> : (d.full_name?.[0] || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{d.full_name}</p>
                    <p className="text-[10px] text-gray-400">{d.phone} · {d.city || '—'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${d.status === 'online' || d.status === 'free' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {d.status === 'online' || d.status === 'free' ? 'На линии' : 'Оффлайн'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>★ {d.rating?.toFixed(1) || '5.0'}</span>
                  <span>·</span>
                  <span>{d.rides_count || 0} поездок</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    await supabase.from('taxi_drivers').update({ is_verified: !d.is_verified }).eq('user_id', d.user_id);
                    setTaxiDrivers(prev => prev.map(x => x.user_id === d.user_id ? { ...x, is_verified: !x.is_verified } : x));
                    toast.success(d.is_verified ? 'Водитель снят с верификации' : 'Водитель верифицирован');
                  }} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${d.is_verified ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                    <CheckCircle size={12} className="inline mr-1" />{d.is_verified ? 'Верифицирован' : 'Верифицировать'}
                  </button>
                  <button onClick={async () => {
                    const newStatus = d.status === 'blocked' ? 'offline' : 'blocked';
                    await supabase.from('taxi_drivers').update({ status: newStatus }).eq('user_id', d.user_id);
                    setTaxiDrivers(prev => prev.map(x => x.user_id === d.user_id ? { ...x, status: newStatus } : x));
                    toast.success(newStatus === 'blocked' ? 'Водитель заблокирован' : 'Водитель разблокирован');
                  }} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${d.status === 'blocked' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}>
                    <XCircle size={12} className="inline mr-1" />{d.status === 'blocked' ? 'Разблокировать' : 'Заблокировать'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
