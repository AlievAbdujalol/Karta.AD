import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { t } from '@/lib/i18n';
import { Plus, Trash2, CheckCircle, XCircle, MapPin, Bus, Users, Globe } from 'lucide-react';

const tabs = ['dashboard', 'cities', 'manageRoutes', 'manageUsers'];

export default function AdminDashboard() {
  const { user, lang } = useOutletContext() || { user: null, lang: 'ru' };
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cities, setCities] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [cityForm, setCityForm] = useState({ name: '', country: '' });
  const [routeForm, setRouteForm] = useState({ number: '', name: '', type: 'bus', city_id: '', stops: [] });
  const [stopForm, setStopForm] = useState({ name: '', lat: '', lng: '' });

  const loadAll = async () => {
    const [c, r, u, v] = await Promise.all([
      base44.entities.City.list(),
      base44.entities.Route.list(),
      base44.entities.User.list(),
      base44.entities.Vehicle.filter({ is_active: true }),
    ]);
    setCities(c); setRoutes(r); setUsers(u); setVehicles(v);
  };

  useEffect(() => { loadAll(); }, []);

  const addCity = async () => {
    if (!cityForm.name || !cityForm.country) return;
    await base44.entities.City.create({ ...cityForm, is_active: true });
    setCityForm({ name: '', country: '' });
    loadAll();
  };

  const deleteCity = async (id) => {
    await base44.entities.City.delete(id);
    loadAll();
  };

  const addRoute = async () => {
    if (!routeForm.number || !routeForm.city_id) return;
    const city = cities.find(c => c.id === routeForm.city_id);
    await base44.entities.Route.create({ ...routeForm, city_name: city?.name, is_active: true });
    setRouteForm({ number: '', name: '', type: 'bus', city_id: '', stops: [] });
    loadAll();
  };

  const deleteRoute = async (id) => {
    await base44.entities.Route.delete(id);
    loadAll();
  };

  const approveDriver = async (uid) => {
    await base44.entities.User.update(uid, { driver_status: 'approved' });
    loadAll();
  };

  const blockDriver = async (uid) => {
    await base44.entities.User.update(uid, { driver_status: 'blocked' });
    loadAll();
  };

  const addStop = () => {
    if (!stopForm.name) return;
    setRouteForm(prev => ({ ...prev, stops: [...(prev.stops || []), { name: stopForm.name, lat: parseFloat(stopForm.lat) || 0, lng: parseFloat(stopForm.lng) || 0 }] }));
    setStopForm({ name: '', lat: '', lng: '' });
  };

  const stats = {
    cities: cities.length,
    routes: routes.length,
    drivers: users.filter(u => u.role === 'driver').length,
    active: vehicles.length,
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(lang, tab)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="max-w-3xl mx-auto">

          {/* Dashboard */}
          {activeTab === 'dashboard' && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { label: t(lang, 'totalCities'), value: stats.cities, icon: <Globe size={20} />, color: 'bg-purple-100 text-purple-700' },
                  { label: t(lang, 'totalRoutes'), value: stats.routes, icon: <Bus size={20} />, color: 'bg-blue-100 text-blue-700' },
                  { label: t(lang, 'totalDrivers'), value: stats.drivers, icon: <Users size={20} />, color: 'bg-green-100 text-green-700' },
                  { label: t(lang, 'activeNow'), value: stats.active, icon: <MapPin size={20} />, color: 'bg-orange-100 text-orange-700' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>{s.icon}</div>
                    <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Active vehicles */}
              <h2 className="font-semibold text-gray-800 mb-3">{t(lang, 'activeDrivers')}</h2>
              {vehicles.length === 0 ? (
                <p className="text-gray-400 text-sm">{t(lang, 'noBusesOnRoute')}</p>
              ) : (
                <div className="space-y-2">
                  {vehicles.map(v => (
                    <div key={v.id} className="bg-white rounded-xl border border-green-200 p-3 flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-xs ${v.type === 'bus' ? 'bg-blue-600' : 'bg-orange-500'}`}>
                        {v.route_number}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{v.driver_name}</p>
                        <p className="text-xs text-gray-400">{v.lat?.toFixed(4)}, {v.lng?.toFixed(4)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cities */}
          {activeTab === 'cities' && (
            <div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-3">{t(lang, 'addCity')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder={t(lang, 'cityName')}
                    value={cityForm.name}
                    onChange={e => setCityForm(p => ({ ...p, name: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    placeholder={t(lang, 'country')}
                    value={cityForm.country}
                    onChange={e => setCityForm(p => ({ ...p, country: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button onClick={addCity} className="mt-3 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 flex items-center gap-2">
                  <Plus size={16} /> {t(lang, 'addCity')}
                </button>
              </div>
              <div className="space-y-2">
                {cities.map(c => (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.country}</p>
                    </div>
                    <button onClick={() => deleteCity(c.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Routes */}
          {activeTab === 'manageRoutes' && (
            <div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-3">{t(lang, 'addRoute')}</h2>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    placeholder={t(lang, 'routeNumber')}
                    value={routeForm.number}
                    onChange={e => setRouteForm(p => ({ ...p, number: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input
                    placeholder={t(lang, 'routeName')}
                    value={routeForm.name}
                    onChange={e => setRouteForm(p => ({ ...p, name: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <select
                    value={routeForm.type}
                    onChange={e => setRouteForm(p => ({ ...p, type: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="bus">{t(lang, 'bus')}</option>
                    <option value="minibus">{t(lang, 'minibus')}</option>
                  </select>
                  <select
                    value={routeForm.city_id}
                    onChange={e => setRouteForm(p => ({ ...p, city_id: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">{t(lang, 'selectCity')}</option>
                    {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {/* Stops */}
                <div className="border-t pt-3 mb-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">{t(lang, 'stops')}</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input placeholder={t(lang, 'stopName')} value={stopForm.name} onChange={e => setStopForm(p => ({ ...p, name: e.target.value }))} className="border rounded-lg px-2 py-1.5 text-xs col-span-1" />
                    <input placeholder={t(lang, 'latitude')} value={stopForm.lat} onChange={e => setStopForm(p => ({ ...p, lat: e.target.value }))} className="border rounded-lg px-2 py-1.5 text-xs" />
                    <input placeholder={t(lang, 'longitude')} value={stopForm.lng} onChange={e => setStopForm(p => ({ ...p, lng: e.target.value }))} className="border rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                  <button onClick={addStop} className="text-blue-600 text-xs font-medium flex items-center gap-1 hover:text-blue-800">
                    <Plus size={14} /> {t(lang, 'addStop')}
                  </button>
                  {routeForm.stops?.map((s, i) => (
                    <div key={i} className="text-xs text-gray-600 mt-1 flex items-center gap-2">
                      <MapPin size={12} className="text-blue-500" />
                      {s.name} ({s.lat}, {s.lng})
                    </div>
                  ))}
                </div>
                <button onClick={addRoute} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 flex items-center gap-2">
                  <Plus size={16} /> {t(lang, 'addRoute')}
                </button>
              </div>
              <div className="space-y-2">
                {routes.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-sm ${r.type === 'bus' ? 'bg-blue-600' : 'bg-orange-500'}`}>
                        {r.number}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{r.name || `№${r.number}`}</p>
                        <p className="text-xs text-gray-400">{r.city_name} · {t(lang, r.type === 'bus' ? 'bus' : 'minibus')} · {r.stops?.length || 0} {t(lang, 'stops')}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteRoute(r.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Users */}
          {activeTab === 'manageUsers' && (
            <div className="space-y-2">
              {users.filter(u => u.role === 'driver').map(u => (
                <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{u.full_name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${
                        u.driver_status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {u.driver_status === 'approved' ? t(lang, 'approved') : t(lang, 'pendingApproval')}
                      </span>
                  </div>
                  <div className="flex gap-2">
                    {!u.driver_status || u.driver_status === 'pending' ? (
                      <button onClick={() => approveDriver(u.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                        <CheckCircle size={18} />
                      </button>
                    ) : null}
                    <button onClick={() => blockDriver(u.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}