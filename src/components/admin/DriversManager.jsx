import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { CheckCircle2, XCircle, User, Clock, ShieldCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabase';

const TABS = ['pending', 'approved', 'blocked'];

export default function DriversManager() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState({});

  const load = useCallback(() => {
    supabase.from('profiles')
      .select('id, full_name, email, phone, vehicle_number, driver_status, city_id, route_id, role')
      .not('driver_status', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[DriversManager] load error:', error); return; }
        setDrivers(data || []);
      })
      .catch(() => setDrivers([]));
    supabase.from('routes')
      .select('id, number, name, type')
      .then(({ data }) => setRoutes(data || []))
      .catch((err) => console.error('[DriversManager] routes load error:', err));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]);

  const updateStatus = async (id, status) => {
    setLoading(prev => ({ ...prev, [id]: status }));
    const payload = { driver_status: status };
    if (status === 'approved') payload.role = 'driver';
    const { error } = await supabase.from('profiles').update(payload).eq('id', id);
    setLoading(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (error) {
      console.error('[DriversManager] update error:', error.message);
      toast.error(t('error') + ': ' + (error.message || t('unknownError')));
      return;
    }
    load();
    toast.success(status === 'approved' ? t('approved') : t('blocked'));
  };

  const statusConfig = {
    pending: { label: t('pending'), cls: 'bg-amber-100 text-amber-800', icon: Clock },
    approved: { label: t('approved'), cls: 'bg-green-100 text-green-800', icon: ShieldCheck },
    blocked: { label: t('blocked'), cls: 'bg-red-100 text-red-800', icon: XCircle },
  };

  const tabCounts = {
    pending: drivers.filter(d => (d.driver_status || 'pending') === 'pending').length,
    approved: drivers.filter(d => d.driver_status === 'approved').length,
    blocked: drivers.filter(d => d.driver_status === 'blocked').length,
  };

  const filtered = drivers.filter(d => (d.driver_status || 'pending') === activeTab);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{t('drivers')}</h3>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {TABS.map(tab => {
          const cfg = statusConfig[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <cfg.icon size={13} />
              {cfg.label}
              {tabCounts[tab] > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab ? 'bg-gray-900 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  {tabCounts[tab]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filtered.map(driver => {
          const status = driver.driver_status || 'pending';
          const cfg = statusConfig[status] || statusConfig.pending;
          const isBusy = loading[driver.id];
          return (
            <div key={driver.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900">
                      {driver.full_name || driver.email}
                    </p>
                    <p className="text-xs text-gray-500">{driver.email}</p>
                    {driver.phone && (
                      <p className="text-xs text-gray-400">{driver.phone}</p>
                    )}
                    {driver.vehicle_number && (
                      <p className="text-xs text-gray-500">№ {driver.vehicle_number}</p>
                    )}
                    {driver.route_id && (() => {
                      const r = routes.find(x => x.id === driver.route_id);
                      return r ? <p className="text-xs text-blue-600">#{r.number} {r.name || ''}</p> : null;
                    })()}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
                  {cfg.label}
                </span>
              </div>
              <div className="flex gap-2">
                {status !== 'approved' && (
                  <button
                    onClick={() => updateStatus(driver.id, 'approved')}
                    disabled={!!isBusy}
                    className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-opacity hover:bg-green-700 active:scale-95"
                  >
                    <CheckCircle2 size={13} />
                    {isBusy === 'approved' ? '...' : t('approve')}
                  </button>
                )}
                {status !== 'blocked' && (
                  <button
                    onClick={() => updateStatus(driver.id, 'blocked')}
                    disabled={!!isBusy}
                    className="flex items-center gap-1.5 text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-opacity hover:bg-red-600 active:scale-95"
                  >
                    <XCircle size={13} />
                    {isBusy === 'blocked' ? '...' : t('block')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">
            {t('drivers')}: 0
          </p>
        )}
      </div>
    </div>
  );
}
