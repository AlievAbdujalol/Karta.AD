import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { Plus, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import ScheduleManager from './ScheduleManager';

export default function RoutesManager() {
  const { t } = useLanguage();
  const [routes, setRoutes] = useState([]);
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState({ number: '', name: '', type: 'bus', city_id: '', color: '#1565C0' });
  const [adding, setAdding] = useState(false);
  const [schedulingRoute, setSchedulingRoute] = useState(null);

  const load = async () => {
    const [r, c] = await Promise.all([
      base44.entities.Route.list(),
      base44.entities.City.list(),
    ]);
    setRoutes(r);
    setCities(c);
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.number || !form.city_id) return;
    await base44.entities.Route.create(form);
    setForm({ number: '', name: '', type: 'bus', city_id: '', color: '#1565C0' });
    setAdding(false);
    load();
    toast.success(t('save'));
  };

  const handleDelete = async (id) => {
    await base44.entities.Route.delete(id);
    load();
  };

  const getCityName = (id) => cities.find(c => c.id === id)?.name || '—';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900">{t('routes')}</h3>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> {t('addRoute')}
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder={t('number')}
              value={form.number}
              onChange={e => setForm({ ...form, number: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder={t('name')}
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="bus">{t('bus')}</option>
              <option value="minibus">{t('minibus')}</option>
            </select>
            <select
              value={form.city_id}
              onChange={e => setForm({ ...form, city_id: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t('selectCity')}</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 font-medium">{t('color')}:</label>
            <input
              type="color"
              value={form.color}
              onChange={e => setForm({ ...form, color: e.target.value })}
              className="w-10 h-8 border rounded-lg cursor-pointer"
            />
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
        {routes.map(route => (
          <div key={route.id} className="bg-white rounded-xl p-4 flex items-center justify-between shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                style={{ background: route.color || '#1565C0' }}
              >
                {route.number}
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">
                  #{route.number} {route.name || ''}
                </p>
                <p className="text-xs text-gray-500">
                  {getCityName(route.city_id)} · {route.type === 'bus' ? t('bus') : t('minibus')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSchedulingRoute(route)}
                className="text-blue-400 hover:text-blue-600 transition-colors p-1"
                title="Расписание"
              >
                <Clock size={16} />
              </button>
              <button onClick={() => handleDelete(route.id)} className="text-red-400 hover:text-red-600 transition-colors p-1">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {routes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">{t('noRoutes')}</p>
        )}
      </div>

      {schedulingRoute && (
        <ScheduleManager route={schedulingRoute} onClose={() => setSchedulingRoute(null)} />
      )}
    </div>
  );
}