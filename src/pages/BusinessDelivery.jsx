import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';
import { Truck, Phone, Navigation, Search } from 'lucide-react';
import BusinessSubHeader from '@/components/BusinessSubHeader';
import {
  nextStatuses, NEXT_STATUS_LABEL, setOrderStatus,
  formatCurrency, formatTimeAgo,
} from '@/lib/business';

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
  const { lang } = useLanguage();
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  /** Тип доставки: из RPC, иначе выводим по наличию адреса. */
  const deliveryTypeOf = (o) => o.delivery_type || (o.delivery_address ? 'delivery' : 'pickup');

  const loadBusinesses = async () => {
    const { data, error } = await supabase.rpc('get_my_businesses');
    if (!error && data && data.length > 0) {
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
      (o) => ['pending', 'ready', 'picked_up', 'in_transit'].includes(o.status)
        && deliveryTypeOf(o) !== 'pickup'
    );
    setOrders(deliveryOrders);
  };

  const handleStatus = async (order, status) => {
    if (status === 'cancelled' && !confirm('Отменить заказ?')) return;
    setUpdatingId(order.id);
    try {
      const ok = await setOrderStatus(order.id, status);
      if (!ok) {
        toast.error('Переход запрещён или нет доступа');
        return;
      }
      toast.success(`Заказ → ${STATUS_LABELS[status]?.ru || status}`);
      if (['delivered', 'cancelled', 'completed'].includes(status)) {
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
      } else {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
      }
    } catch (e) {
      toast.error(e.message || 'Не удалось сменить статус');
    } finally {
      setUpdatingId(null);
    }
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

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <BusinessSubHeader
          title="Доставка"
          icon={Truck}
          iconClassName="text-orange-500 flex items-center"
          right={<span className="text-xs text-slate-400">{orders.length} активных</span>}
        />

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
            { value: 'ready', label: { ru: 'Готов', tg: 'Тайёр', en: 'Ready' } },
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
                        {DELIVERY_LABELS[deliveryTypeOf(order)]?.[lang] || deliveryTypeOf(order)}
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
                    <p className="text-[11px] text-slate-400 mt-1">{formatTimeAgo(order.created_at)}</p>
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
                    {nextStatuses(order.status).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {nextStatuses(order.status).map((st) => (
                          <button
                            key={st}
                            onClick={() => handleStatus(order, st)}
                            disabled={updatingId === order.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                              st === 'cancelled'
                                ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                                : 'bg-orange-500 hover:bg-orange-600 text-white'
                            }`}
                          >
                            {NEXT_STATUS_LABEL[st] || st}
                          </button>
                        ))}
                      </div>
                    )}
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
