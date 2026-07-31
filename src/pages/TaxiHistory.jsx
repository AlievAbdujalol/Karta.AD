import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Star, MapPin, Clock, Car, Search, Heart, RotateCcw, Phone, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useNavigate } from 'react-router-dom';
import { formatTJS, tariffById } from '@/lib/taxi';
import { toast } from 'sonner';

export default function TaxiHistory() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [favs, setFavs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const isDriver = user?.role === 'taxi_driver';

  useEffect(() => {
    if (!user?.id) return;
    const fetchHistory = async () => {
      let q = supabase.from('taxi_orders')
        .select('*')
        .eq(isDriver ? 'driver_id' : 'passenger_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (tab === 'completed') q = q.eq('status', 'completed');
      if (tab === 'cancelled') q = q.eq('status', 'cancelled');
      const { data } = await q;
      const list = data || [];
      const otherIds = [...new Set(list.map(o => isDriver ? o.passenger_id : o.driver_id).filter(Boolean))];
      let nameMap = {};
      if (otherIds.length) {
        const [{ data: drivers }, { data: passengers }] = await Promise.all([
          isDriver ? Promise.resolve({ data: [] }) : supabase.from('taxi_drivers').select('full_name, user_id').in('user_id', otherIds),
          isDriver ? supabase.from('profiles').select('full_name, id').in('id', otherIds) : Promise.resolve({ data: [] }),
        ]);
        nameMap = Object.fromEntries([...(drivers || []).map(d => [d.user_id, d.full_name]), ...(passengers || []).map(p => [p.id, p.full_name])]);
      }
      setOrders(list.map(o => ({ ...o, other_name: nameMap[isDriver ? o.passenger_id : o.driver_id] })));
      setLoading(false);
    };
    setLoading(true);
    fetchHistory();
  }, [user?.id, tab, isDriver]);

  // Избранные водители (только пассажир)
  useEffect(() => {
    if (!user?.id || isDriver) return;
    supabase.from('taxi_favorite_drivers')
      .select('id, driver_id, created_at')
      .eq('passenger_id', user.id)
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const rows = data || [];
        if (!rows.length) { setFavs([]); return; }
        const ids = [...new Set(rows.map(r => r.driver_id))];
        const { data: drivers } = await supabase.from('taxi_drivers')
          .select('user_id, full_name, phone, photo_url, rating, rides_count').in('user_id', ids);
        const map = Object.fromEntries((drivers || []).map(d => [d.user_id, d]));
        setFavs(rows.map(r => ({ ...r, driver: map[r.driver_id] })).filter(f => f.driver));
      });
  }, [user?.id, isDriver]);

  const removeFavorite = async (id) => {
    await supabase.from('taxi_favorite_drivers').delete().eq('id', id);
    setFavs(prev => prev.filter(f => f.id !== id));
    toast.info('Водитель удалён из избранного');
  };

  const repeatTrip = (order) => {
    navigate('/taxi', {
      state: {
        trip: {
          from: { name: order.pickup_address, lat: order.pickup_lat, lng: order.pickup_lng },
          to: { name: order.dropoff_address, lat: order.dropoff_lat, lng: order.dropoff_lng },
          category: order.category,
        },
      },
    });
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return orders;
    const q = query.trim().toLowerCase();
    return orders.filter(o =>
      (o.pickup_address || '').toLowerCase().includes(q) ||
      (o.dropoff_address || '').toLowerCase().includes(q) ||
      (o.other_name || '').toLowerCase().includes(q)
    );
  }, [orders, query]);

  const totalSpent = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);

  const statusBadge = (status) => ({
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }[status] || 'bg-slate-100 text-slate-600');

  const statusLabel = (status) => ({
    completed: 'Завершён', cancelled: 'Отменён', riding: 'В пути', found: 'Водитель едет', searching: 'Поиск',
  }[status] || status);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold">История поездок</h1>
          <p className="text-[10px] text-slate-400">
            {isDriver ? `Заработано ${formatTJS(totalSpent)} TJS` : `${orders.length} поездок · Потрачено ${formatTJS(totalSpent)} TJS`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {[
          { id: 'all', label: 'Все' },
          { id: 'completed', label: 'Завершённые' },
          { id: 'cancelled', label: 'Отменённые' },
          ...(isDriver ? [] : [{ id: 'favorites', label: `Избранное${favs.length ? ` (${favs.length})` : ''}` }]),
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${tab === id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 border border-gray-200 dark:border-slate-700'}`}
          >{label}</button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-3 py-2 border border-gray-200 dark:border-slate-700">
          <Search size={14} className="text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isDriver ? 'Поиск по адресу или пассажиру...' : 'Поиск по адресу или водителю...'}
            className="flex-1 bg-transparent outline-none text-xs"
          />
        </div>
      </div>

      {/* Favorites */}
      {tab === 'favorites' && !isDriver && (
        <div className="px-4 space-y-3">
          {favs.length === 0 && (
            <div className="text-center py-12">
              <Heart size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400">Нет избранных водителей</p>
              <p className="text-[10px] text-slate-400 mt-1">Добавьте водителя в избранное после поездки — он появится здесь</p>
            </div>
          )}
          {favs.map(f => (
            <div key={f.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-sm overflow-hidden flex-shrink-0">
                {f.driver.photo_url ? <img src={f.driver.photo_url} alt="" className="w-full h-full object-cover" /> : (f.driver.full_name?.[0] || '?')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{f.driver.full_name}</p>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                  <span className="flex items-center gap-0.5"><Star size={9} className="text-amber-400" fill="currentColor" /> {f.driver.rating?.toFixed(1) || '5.0'}</span>
                  <span>·</span>
                  <span>{f.driver.rides_count || 0} поездок</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <a href={`tel:${f.driver.phone || ''}`}
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                  <Phone size={14} />
                </a>
                <button onClick={() => removeFavorite(f.id)}
                  className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Orders list */}
      {tab !== 'favorites' && (
      <div className="px-4 pb-20 space-y-3">
        {loading && <div className="text-center py-8 text-slate-400 text-xs">Загрузка...</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Car size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">{query ? 'Ничего не найдено' : 'Нет поездок'}</p>
          </div>
        )}
        {filtered.map(order => {
          const tariff = tariffById(order.category);
          return (
            <div key={order.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${statusBadge(order.status)}`}>
                    {statusLabel(order.status)}
                  </span>
                  <span className="text-[10px] text-slate-400">{tariff.short}</span>
                  {order.other_name && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1"><Car size={10} /> {order.other_name}</span>
                  )}
                </div>
                <p className="text-sm font-black text-slate-800 dark:text-slate-100">{formatTJS(order.price)} TJS</p>
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
                {order.distance_km != null && <span className="flex items-center gap-1"><MapPin size={10} /> {Number(order.distance_km).toFixed(1)} км</span>}
                {order.duration_min != null && <span>~{order.duration_min} мин</span>}
                {order.rating && <span className="flex items-center gap-1"><Star size={10} className="text-amber-400" fill="currentColor" /> {order.rating}</span>}
              </div>

              {!isDriver && (
                <button onClick={() => repeatTrip(order)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-[11px] font-bold hover:bg-blue-100 transition-colors">
                  <RotateCcw size={12} /> Повторить поездку
                </button>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
