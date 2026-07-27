import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { City, Route, UserProfile, Vehicle } from '@/api/entities';
import { useLanguage } from '@/lib/useLanguage';
import { COUNTRIES, getFlag } from '@/lib/countryData';
import { Plus, Trash2, CheckCircle, XCircle, MapPin, Bus, Users, Globe, Search, X } from 'lucide-react';

const tabs = ['dashboard', 'cities', 'manageRoutes', 'manageUsers'];

export default function AdminDashboard() {
  const { user } = useOutletContext() || { user: null };
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cities, setCities] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [cityForm, setCityForm] = useState({ name: '', country: '' });
  const [countrySearch, setCountrySearch] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [routeForm, setRouteForm] = useState({ number: '', name: '', type: 'bus', city_id: '', price: '', stops: [] });
  const [stopForm, setStopForm] = useState({ name: '', lat: '', lng: '' });

  const loadAll = async () => {
    const [c, r, u, v] = await Promise.all([
      City.list(),
      Route.list(),
      UserProfile.list(),
      Vehicle.filter({ is_active: true }),
    ]);
    setCities(c); setRoutes(r); setUsers(u); setVehicles(v);
  };

  useEffect(() => { loadAll(); }, []);

  const addCity = async () => {
    if (!cityForm.name || !cityForm.country) return;
    await City.create({ ...cityForm, is_active: true });
    setCityForm({ name: '', country: '' });
    loadAll();
  };

  const deleteCity = async (id) => {
    await City.delete(id);
    loadAll();
  };

  const addRoute = async () => {
    if (!routeForm.number || !routeForm.city_id) return;
    const city = cities.find(c => c.id === routeForm.city_id);
    await Route.create({ ...routeForm, price: routeForm.price ? parseFloat(routeForm.price) : null, city_name: city?.name, is_active: true });
    setRouteForm({ number: '', name: '', type: 'bus', city_id: '', price: '', stops: [] });
    loadAll();
  };

  const deleteRoute = async (id) => {
    await Route.delete(id);
    loadAll();
  };

  const approveDriver = async (uid) => {
    await UserProfile.update(uid, { driver_status: 'approved' });
    loadAll();
  };

  const blockDriver = async (uid) => {
    await UserProfile.update(uid, { driver_status: 'blocked' });
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
      <div className="bg-white border-b border-gray-200 px-4 flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t( tab)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="max-w-3xl mx-auto">

          {activeTab === 'dashboard' && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { label: t( 'totalCities'), value: stats.cities, icon: <Globe size={20} />, color: 'bg-purple-100 text-purple-700' },
                  { label: t( 'totalRoutes'), value: stats.routes, icon: <Bus size={20} />, color: 'bg-blue-100 text-blue-700' },
                  { label: t( 'totalDrivers'), value: stats.drivers, icon: <Users size={20} />, color: 'bg-green-100 text-green-700' },
                  { label: t( 'activeNow'), value: stats.active, icon: <MapPin size={20} />, color: 'bg-orange-100 text-orange-700' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>{s.icon}</div>
                    <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>
              <h2 className="font-semibold text-gray-800 mb-3">{t( 'activeDrivers')}</h2>
              {vehicles.length === 0 ? (
                <p className="text-gray-400 text-sm">{t( 'noBusesOnRoute')}</p>
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

          {activeTab === 'cities' && (
            <div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-3">{t( 'addCity')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder={t( 'cityName')} value={cityForm.name} onChange={e => setCityForm(p => ({ ...p, name: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                  <div className="relative">
                    <div
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm cursor-pointer bg-white text-gray-900"
                      onClick={() => setCountryOpen(!countryOpen)}
                    >
                      {cityForm.country ? `${getFlag(cityForm.country)} ${cityForm.country}` : t( 'country')}
                    </div>
                    {countryOpen && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border rounded-xl shadow-lg max-h-60 overflow-hidden flex flex-col">
                        <div className="flex items-center gap-2 px-3 py-2 border-b sticky top-0 bg-white">
                          <Search size={14} className="text-gray-400" />
                          <input
                            autoFocus
                            placeholder={t( 'searchCountry')}
                            value={countrySearch}
                            onChange={e => setCountrySearch(e.target.value)}
                            className="flex-1 text-sm outline-none bg-gray-800 text-white placeholder-gray-400 rounded px-2 py-1"
                          />
                          {countrySearch && (
                            <button onClick={() => setCountrySearch('')} className="text-gray-400 hover:text-gray-600">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <div className="overflow-y-auto flex-1">
                          {COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase())).length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4">{t( 'countryNotFound')}</p>
                          ) : (
                            COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                              <button
                                key={c}
                                onClick={() => { setCityForm(p => ({ ...p, country: c })); setCountryOpen(false); setCountrySearch(''); }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 transition-colors ${cityForm.country === c ? 'bg-blue-50 font-medium' : ''}`}
                              >
                                <span>{getFlag(c)}</span>
                                <span className="text-gray-900">{c}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={addCity} className="mt-3 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 flex items-center gap-2">
                  <Plus size={16} /> {t( 'addCity')}
                </button>
              </div>
              <div className="space-y-2">
                {cities.map(c => (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                    <div><p className="font-medium text-sm text-gray-800">{c.name}</p><p className="text-xs text-gray-500">{getFlag(c.country)} {c.country}</p></div>
                    <button onClick={() => deleteCity(c.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'manageRoutes' && (
            <div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-3">{t( 'addRoute')}</h2>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <input placeholder={t( 'routeNumber')} value={routeForm.number} onChange={e => setRouteForm(p => ({ ...p, number: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900" />
                  <input placeholder={t( 'routeName')} value={routeForm.name} onChange={e => setRouteForm(p => ({ ...p, name: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900" />
                  <select value={routeForm.type} onChange={e => setRouteForm(p => ({ ...p, type: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                    <option value="bus">{t( 'bus')}</option><option value="minibus">{t( 'minibus')}</option>
                  </select>
                  <select value={routeForm.city_id} onChange={e => setRouteForm(p => ({ ...p, city_id: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                    <option value="">{t( 'selectCity')}</option>
                    {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    type="number" step="0.01" min="0"
                    placeholder={t( 'pricePlaceholder')}
                    value={routeForm.price}
                    onChange={e => setRouteForm(p => ({ ...p, price: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                  />
                </div>
                <div className="border-t pt-3 mb-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">{t( 'stops')}</p>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input placeholder={t( 'stopName')} value={stopForm.name} onChange={e => setStopForm(p => ({ ...p, name: e.target.value }))} className="border rounded-lg px-2 py-1.5 text-xs" />
                    <input placeholder={t( 'latitude')} value={stopForm.lat} onChange={e => setStopForm(p => ({ ...p, lat: e.target.value }))} className="border rounded-lg px-2 py-1.5 text-xs" />
                    <input placeholder={t( 'longitude')} value={stopForm.lng} onChange={e => setStopForm(p => ({ ...p, lng: e.target.value }))} className="border rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                  <button onClick={addStop} className="text-blue-600 text-xs font-medium flex items-center gap-1 hover:text-blue-800"><Plus size={14} /> {t( 'addStop')}</button>
                  {routeForm.stops?.map((s, i) => (
                    <div key={i} className="text-xs text-gray-600 mt-1 flex items-center gap-2"><MapPin size={12} className="text-blue-500" />{s.name} ({s.lat}, {s.lng})</div>
                  ))}
                </div>
                <button onClick={addRoute} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 flex items-center gap-2"><Plus size={16} /> {t( 'addRoute')}</button>
              </div>
              <div className="space-y-2">
                {routes.map(r => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-sm ${r.type === 'bus' ? 'bg-blue-600' : 'bg-orange-500'}`}>{r.number}</div>
                      <div><p className="text-sm font-medium text-gray-800">{r.name || `№${r.number}`}</p><p className="text-xs text-gray-400">{r.city_name} · {t( r.type === 'bus' ? 'bus' : 'minibus')} · {r.stops?.length || 0} {t( 'stops')}{r.price ? ` · ${r.price} ${t('somoni')}` : ''}</p></div>
                    </div>
                    <button onClick={() => deleteRoute(r.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'manageUsers' && (
            <div className="space-y-2">
              {users.filter(u => u.role === 'driver').map(u => (
                <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{u.full_name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${u.driver_status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {u.driver_status === 'approved' ? t( 'approved') : t( 'pendingApproval')}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {(!u.driver_status || u.driver_status === 'pending') && (
                      <button onClick={() => approveDriver(u.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle size={18} /></button>
                    )}
                    <button onClick={() => blockDriver(u.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><XCircle size={18} /></button>
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
