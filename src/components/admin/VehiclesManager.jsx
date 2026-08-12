import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useLanguage } from '@/lib/useLanguage';
import { Bus, MapPin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function VehiclesManager() {
  const { t } = useLanguage();
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);

  const load = () => {
    supabase.from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setVehicles(data || []))
      .catch(() => setVehicles([]));
    supabase.from('routes')
      .select('id, number, name, type')
      .then(({ data }) => setRoutes(data || []))
      .catch((err) => console.error('[VehiclesManager] routes load error:', err));
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (v) => {
    const next = !v.is_active;
    const { error } = await supabase.from('vehicles').update({ is_active: next }).eq('id', v.id);
    if (error) { toast.error('Не удалось обновить'); return; }
    setVehicles(prev => prev.map(x => x.id === v.id ? { ...x, is_active: next } : x));
    toast.success(next ? 'Активирован' : 'Деактивирован');
  };

  const remove = async (v) => {
    if (!confirm('Удалить транспорт?')) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', v.id);
    if (error) { toast.error('Не удалось удалить'); return; }
    setVehicles(prev => prev.filter(x => x.id !== v.id));
    toast.success('Удалён');
  };

  const routeName = (routeId) => {
    const r = routes.find(x => x.id === routeId);
    return r ? `#${r.number} ${r.name || ''}` : '—';
  };

  if (vehicles.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Bus size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">{t('admin.vehicles.noFavorites') || 'Нет транспорта'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {vehicles.map(v => (
        <div key={v.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100">
          <span className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${v.is_active ? 'bg-green-500' : 'bg-gray-400'}`}>
            {v.type === 'minibus' ? '🚐' : '🚌'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-800 text-sm">{v.vehicle_number || 'Без номера'}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {v.is_active ? 'Активен' : 'Неактивен'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
              <MapPin size={10} />
              <span>{routeName(v.route_id)}</span>
              <span className="mx-1">·</span>
              <Bus size={10} />
              <span>{v.type === 'minibus' ? 'Маршрутка' : 'Автобус'}</span>
            </div>
          </div>
          <button onClick={() => toggleActive(v)} className={`text-xs px-2 py-1 rounded-lg ${v.is_active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-600 hover:bg-green-200'} transition-colors`}>
            {v.is_active ? 'Выкл' : 'Вкл'}
          </button>
          <button onClick={() => remove(v)} className="text-red-400 hover:text-red-600 transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
