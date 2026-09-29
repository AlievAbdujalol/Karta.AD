import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';
import { Truck, MapPin, Phone, Clock, Navigation, Filter, Search } from 'lucide-react';

const DELIVERY_LABELS = {
  courier: { ru: 'Курьер', tg: 'Курьер', en: 'Courier' },
  pickup: { ru: 'Самовывоз', tg: 'Хатмӣ', en: 'Pickup' },
  delivery: { ru: 'Доставка', tg: 'Доставка', en: 'Delivery' },
};

const STATUS_LABELS = {
  pending: { ru: 'Создан', tg: 'Сохта', en: 'Created' },
  assigned: { ru: 'Курьер назначен', tg: 'Курьер таъин', en: 'Courier assigned' },
  picked_up: { ru: 'Забран', tg: 'Гирифта', en: 'Picked up' },
  in_transit: { ru: 'В пути', tg: 'Роҳ', en: 'In transit' },
  delivered: { ru: 'Доставлен', tg: 'Расонда', en: 'Delivered' },
  completed: { ru: 'Завершён', tg: 'Анҷом', en: 'Completed' },
  cancelled: { ru: 'Отменён', tg: 'Бекор', en: 'Cancelled' },
};

export default function BusinessDelivery() {
  const { user } = useCurrentUser();
  const { t, lang } = useLanguage();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);

  const loadBusinesses = async () => {
    const { data, error } = await supabase.rpc('get_my_businesses');
    if (!error && data && data.length > 0) {
      setBusinesses(data);
      setSelectedBusiness(data[0]);
    }
  };

  const loadOrders = async (businessId) => {
    if (!businessId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_business_orders', { p_business_id: businessId });
    setLoading(false);
    if (error) {
      toast.error('Ошибка загрузки');
      return;
    }
    const deliveryOrders = (data || []).filter(
      (o) => o.status === 'in_transit' || o.status === 'picked_up' || o.status === 'assigned' || o.status === 'pending'
    );
    setOrders(deliveryOrders);
  };

  useEffect(() => {
    if (user?.id) loadBusinesses();
  }, [user?.id]);

  useEffect(() => {
    if (selectedBusiness) loadOrders(selectedBusiness.id);
  }, [selectedBusiness?.id]);

  const filteredOrders = orders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.id?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.delivery_address?.toLowerCase().includes(q)
    );
  });

  const formatCurrency = (n) => {
    if (!n) return '0';
    return `${new Intl.NumberFormat('ru-RU').format(n)} сом`;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    return `${Math.floor(diff / 3600000)} ч назад`;
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Truck size={22} className="text-orange-500" />
            Доставка
          </h1>
          <span className="text-xs text-slate-400">{orders.length} активных</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по заказу или адресу..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { value: null, label: { ru: 'Все', tg: 'Ҳама', en: 'All' } },
            { value: 'pending', label: { ru: 'Создан', tg: 'Сохта', en: 'Created' } },
            { value: 'assigned', label: { ru: 'Назначен', tg: 'Таъин', en: 'Assigned' } },
            { value: 'picked_up', label: { ru: 'Забран', tg: 'Гирифта', en: 'Picked up' } },
            { value: 'in_transit', label: { ru: 'В пути', tg: 'Роҳ', en: 'In transit' } },
            { value: 'delivered', label: { ru: 'Доставлен', tg: 'Расонда', en: 'Delivered' } },
          ].map((f) => (
            <button
              key={f.value || 'all'}
              onClick={() => setStatusFilter(f.value)}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === f.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {f.label[lang]}
            </button>
          ))}
        </div>

        {/* Map placeholder */}
        <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl h-48 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-6 left-6 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
            <div className="absolute top-10 right-10 w-3 h-3 bg-emerald-500 rounded-full" />
            <div className="absolute bottom-8 left-1/3 w-3 h-3 bg-amber-500 rounded-full" />
            <div className="absolute top-1/3 right-6 w-8 h-8 border-2 border-blue-400 rounded-full animate-ping opacity-50" />
          </div>
          <div className="text-center z-10">
            <Navigation size={36} className="text-blue-500 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Карта доставки</p>
            <p className="text-xs text-slate-400">Отслеживание курьеров в реальном времени</p>
          </div>
        </div>

        {/* Orders */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center space-y-2 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="text-4xl">🚚</div>
            <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">Нет активных доставок</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">Заказы в пути появятся здесь</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <button
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 bg-orange-50 dark:bg-orange-500/10 rounded-full flex items-center justify-center shrink-0">
                    <Truck size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">#{order.id.slice(0, 8)}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-500/10">
                        {DELIVERY_LABELS[order.delivery_type]?.[lang] || order.delivery_type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{order.delivery_address || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      order.status === 'delivered' ? 'bg-emerald-50 text-emerald-600' :
                      order.status === 'cancelled' ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-600'
                    }`}>
                      {STATUS_LABELS[order.status]?.[lang] || order.status}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">{formatTime(order.created_at)}</p>
                  </div>
                </button>

                {expandedOrder === order.id && (
                  <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone size={14} className="text-slate-400" />
                      <span className="text-slate-700 dark:text-slate-200">{order.customer_phone || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">Клиент:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{order.customer_name || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm pt-2">
                      <span className="text-slate-400">Итого:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
