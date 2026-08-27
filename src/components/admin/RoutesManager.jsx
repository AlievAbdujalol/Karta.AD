import { useState, useEffect } from 'react';
import { Route, City } from '@/api/entities';
import { supabase } from '@/api/supabase';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Plus, Trash2, Clock, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import ScheduleManager from './ScheduleManager';

export default function RoutesManager() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [routes, setRoutes] = useState([]);
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState({ number: '', name: '', type: 'bus', city_id: '', color: '#1565C0' });
  const [adding, setAdding] = useState(false);
  const [schedulingRoute, setSchedulingRoute] = useState(null);
  const [transferRoute, setTransferRoute] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState('');

  const isSuperAdmin = user?.role === 'admin' && user?.admin_activated;

  const load = async () => {
    const [r, c] = await Promise.all([
      Route.list(),
      City.list(),
    ]);
    setRoutes(r);
    setCities(c);
  };
  useEffect(() => { load(); }, []);

  const loadAdmins = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'admin');
    setAdmins(data || []);
  };

  const handleAdd = async () => {
    if (!form.number || !form.city_id) {
      toast.error(t('admin.routes.fillFieldsError'));
      return;
    }
    try {
      await Route.create({ ...form, created_by_id: user?.id });
      setForm({ number: '', name: '', type: 'bus', city_id: '', color: '#1565C0' });
      setAdding(false);
      load();
      toast.success(t('save'));
    } catch (err) {
      toast.error(err.message || t('admin.routes.saveError'));
    }
  };

  const handleDelete = async (id) => {
    await Route.delete(id);
    load();
  };

  const handleTransfer = async () => {
    if (!transferRoute || !selectedAdminId) return;
    try {
      const { data, error } = await supabase.rpc('transfer_route', {
        p_route_id: transferRoute.id,
        p_new_owner_id: selectedAdminId,
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(t('admin.routes.transferSuccess'));
        setTransferRoute(null);
        setSelectedAdminId('');
        load();
      } else {
        toast.error(data?.error || t('admin.routes.transferError'));
      }
    } catch (err) {
      toast.error(err.message || t('admin.routes.transferErrorDetail'));
    }
  };

  const getCityName = (id) => cities.find(c => c.id === id)?.name || '—';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900">{t('routes')}</h3>
        <button onClick={() => setAdding(!adding)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
          <Plus size={15} /> {t('addRoute')}
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder={t('number')} value={form.number}
              onChange={e => setForm({ ...form, number: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input placeholder={t('name')} value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="bus">{t('bus')}</option>
              <option value="minibus">{t('minibus')}</option>
            </select>
            <select value={form.city_id} onChange={e => setForm({ ...form, city_id: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('selectCity')}</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 font-medium">{t('color')}:</label>
            <input type="color" value={form.color}
              onChange={e => setForm({ ...form, color: e.target.value })} className="w-10 h-8 border rounded-lg cursor-pointer" />
            <div className="w-6 h-6 rounded-full border-2 border-white shadow" style={{ background: form.color }} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {t('save')}
            </button>
            <button onClick={() => setAdding(false)} className="border text-gray-600 px-4 py-2 rounded-lg text-sm">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {routes.map(route => {
          const isOwner = route.created_by_id === user?.id;
          // Строго владелец — только он может менять/удалять; передача — через Super Admin
          const canManage = isOwner || (!route.created_by_id && isSuperAdmin);
          return (
          <div key={route.id} className={`bg-white rounded-xl p-4 flex items-center justify-between shadow-sm border ${canManage ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                style={{ background: route.color || '#1565C0' }}>
                {route.number}
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">#{route.number} {route.name || ''} {!canManage && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 ml-1">чужой</span>}</p>
                <p className="text-xs text-gray-500">{getCityName(route.city_id)} · {route.type === 'bus' ? t('bus') : t('minibus')} {route.created_by_id && !isOwner && <span className="text-[10px]">· владелец: {admins.find(a => a.id === route.created_by_id)?.full_name || route.created_by_id.slice(0, 6)}</span>}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canManage ? (
                <button onClick={() => setSchedulingRoute(route)} className="text-blue-400 hover:text-blue-600 transition-colors p-1" title={t('admin.routes.scheduleTooltip')}>
                  <Clock size={16} />
                </button>
              ) : (
                <span className="text-gray-300 p-1" title="Только владелец может изменять">
                  <Clock size={16} />
                </span>
              )}
              {isSuperAdmin && (
                <button onClick={() => { setTransferRoute(route); loadAdmins(); setSelectedAdminId(''); }}
                  className="text-amber-500 hover:text-amber-700 transition-colors p-1" title={t('admin.routes.transferTooltip')}>
                  <ArrowLeftRight size={16} />
                </button>
              )}
              {canManage ? (
                <button onClick={() => handleDelete(route.id)} className="text-red-400 hover:text-red-600 transition-colors p-1">
                  <Trash2 size={16} />
                </button>
              ) : (
                <span className="text-gray-300 p-1" title="Только владелец может удалять">
                  <Trash2 size={16} />
                </span>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {transferRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setTransferRoute(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-sm mb-1">{t('admin.routes.transferModalTitle')}</h4>
            <p className="text-xs text-gray-500 mb-3">Маршрут #{transferRoute.number} будет передан другому администратору</p>
            <select value={selectedAdminId} onChange={e => setSelectedAdminId(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm mb-4">
              <option value="">{t('admin.routes.selectAdminPlaceholder')}</option>
              {admins.filter(a => a.id !== user?.id).map(a => (
                <option key={a.id} value={a.id}>{a.full_name || a.email}</option>
              ))}
            </select>
            {admins.filter(a => a.id !== user?.id).length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">Нет других администраторов для передачи маршрута</p>
            )}
            <div className="flex gap-2">
              <button onClick={handleTransfer} disabled={!selectedAdminId}
                className="flex-1 bg-amber-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                {t('admin.routes.transferButton')}
              </button>
              <button onClick={() => setTransferRoute(null)}
                className="flex-1 border text-gray-600 py-2.5 rounded-xl text-sm">
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {schedulingRoute && <ScheduleManager route={schedulingRoute} onClose={() => setSchedulingRoute(null)} />}
    </div>
  );
}
