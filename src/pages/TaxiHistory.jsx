import { useState, useEffect } from 'react';
import { ArrowLeft, Star, MapPin, Clock, Car } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useNavigate } from 'react-router-dom';

export default function TaxiHistory() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    if (!user?.id) return;
    const fetchHistory = async () => {
      let query = supabase.from('taxi_orders')
        .select('*, taxi_drivers!taxi_orders_driver_id_fkey(full_name, rating)')
        .eq('passenger_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (tab === 'completed') query = query.eq('status', 'completed');
      if (tab === 'cancelled') query = query.eq('status', 'cancelled');
      const { data } = await query;
      setOrders(data || []);
      setLoading(false);
    };
    fetchHistory();
  }, [user?.id, tab]);

  const totalSpent = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold">История поездок</h1>
          <p className="text-[10px] text-slate-400">{orders.length} поездок · Потрачено {totalSpent.toFixed(0)} TJS</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3 flex gap-2">
        {[
          { id: 'all', label: 'Все' },
          { id: 'completed', label: 'Завершённые' },
          { id: 'cancelled', label: 'Отменённые' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => { setTab(id); setLoading(true); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-gray-200 dark:border-slate-700'}`}
          >{label}</button>
        ))}
      </div>

      {/* Orders list */}
      <div className="px-4 pb-20 space-y-3">
        {loading && <div className="text-center py-8 text-slate-400 text-xs">Загрузка...</div>}
        {!loading && orders.length === 0 && (
          <div className="text-center py-12">
            <Car size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">Нет поездок</p>
          </div>
        )}
        {orders.map(order => (
          <div key={order.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                  order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {order.status === 'completed' ? 'Завершён' : 'Отменён'}
                </span>
                <span className="text-[10px] text-slate-400">{order.category || 'economy'}</span>
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{order.price || '—'} TJS</p>
            </div>

            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center gap-0.5 pt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{order.pickup_address || 'Не указан'}</p>
                {order.dropoff_address && (
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">→ {order.dropoff_address}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><Clock size={10} /> {new Date(order.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              {order.distance && <span className="flex items-center gap-1"><MapPin size={10} /> {order.distance}</span>}
              {order.rating && <span className="flex items-center gap-1"><Star size={10} className="text-amber-400" fill="currentColor" /> {order.rating}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
