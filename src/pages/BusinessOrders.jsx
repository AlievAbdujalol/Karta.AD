import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';
import { ClipboardList, Search, ChevronRight, Package, MapPin, Phone, Clock, Plus, Minus, X } from 'lucide-react';
import BusinessSubHeader from '@/components/BusinessSubHeader';
import {
  nextStatuses, NEXT_STATUS_LABEL, setOrderStatus, createOrder,
  formatCurrency, formatTimeAgo,
} from '@/lib/business';

const STATUS_LABELS = {
  pending: { ru: 'Ожидает', tg: 'Интизор', en: 'Pending' },
  confirmed: { ru: 'Подтверждён', tg: 'Тасдиқ', en: 'Confirmed' },
  payment_pending: { ru: 'Ожидает оплату', tg: 'Интизори пардохт', en: 'Payment pending' },
  paid: { ru: 'Оплачен', tg: 'Пардохт', en: 'Paid' },
  preparing: { ru: 'Готовится', tg: 'Тайёр', en: 'Preparing' },
  ready: { ru: 'Готов', tg: 'Тайёр', en: 'Ready' },
  delivery_created: { ru: 'Доставка создана', tg: 'Доставка сохта', en: 'Delivery created' },
  courier_assigned: { ru: 'Курьер назначен', tg: 'Курьер таъин', en: 'Courier assigned' },
  picked_up: { ru: 'Забран', tg: 'Гирифта', en: 'Picked up' },
  in_transit: { ru: 'В пути', tg: 'Роҳ', en: 'In transit' },
  delivered: { ru: 'Доставлен', tg: 'Расонда', en: 'Delivered' },
  completed: { ru: 'Завершён', tg: 'Анҷом', en: 'Completed' },
  cancelled: { ru: 'Отменён', tg: 'Бекор', en: 'Cancelled' },
  refunded: { ru: 'Возврат', tg: 'Бозгард', en: 'Refunded' },
};

const STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10',
  confirmed: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10',
  payment_pending: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10',
  paid: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10',
  preparing: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10',
  ready: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10',
  delivery_created: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10',
  courier_assigned: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10',
  picked_up: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10',
  in_transit: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10',
  delivered: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10',
  completed: 'bg-green-50 text-green-600 dark:bg-green-500/10',
  cancelled: 'bg-red-50 text-red-600 dark:bg-red-500/10',
  refunded: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10',
};

const FILTERS = [
  { value: null, label: { ru: 'Все', tg: 'Ҳама', en: 'All' } },
  { value: 'pending', label: { ru: 'Ожидают', tg: 'Интизор', en: 'Pending' } },
  { value: 'confirmed', label: { ru: 'Подтверждены', tg: 'Тасдиқ', en: 'Confirmed' } },
  { value: 'paid', label: { ru: 'Оплачены', tg: 'Пардохт', en: 'Paid' } },
  { value: 'preparing', label: { ru: 'Готовятся', tg: 'Тайёр', en: 'Preparing' } },
  { value: 'in_transit', label: { ru: 'В пути', tg: 'Роҳ', en: 'In transit' } },
  { value: 'delivered', label: { ru: 'Доставлены', tg: 'Расонда', en: 'Delivered' } },
  { value: 'cancelled', label: { ru: 'Отменены', tg: 'Бекор', en: 'Cancelled' } },
];

export default function BusinessOrders() {
  const { user } = useCurrentUser();
  const { lang } = useLanguage();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [products, setProducts] = useState([]);
  const [newOrder, setNewOrder] = useState({ customer_name: '', customer_phone: '', delivery_type: 'delivery', delivery_address: '', notes: '' });
  const [picked, setPicked] = useState({});

  const loadBusinesses = async () => {
    const { data, error } = await supabase.rpc('get_my_businesses');
    if (!error && data && data.length > 0) {
      setBusinesses(data);
      setSelectedBusiness(data[0]);
    }
  };

  const loadOrders = async (businessId, status = null) => {
    if (!businessId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_business_orders', {
      p_business_id: businessId,
      p_status: status,
    });
    setLoading(false);
    if (error) {
      toast.error('Ошибка загрузки заказов');
      return;
    }
    setOrders(data || []);
  };

  const loadOrderItems = async (orderId) => {
    if (orderItems[orderId]) return;
    const { data, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);
    if (!error) {
      setOrderItems((prev) => ({ ...prev, [orderId]: data || [] }));
    }
  };

  useEffect(() => {
    if (user?.id) loadBusinesses();
  }, [user?.id]);

  useEffect(() => {
    if (selectedBusiness) {
      loadOrders(selectedBusiness.id, filter);
    }
  }, [selectedBusiness?.id, filter]);

  const toggleExpand = (orderId) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(orderId);
      loadOrderItems(orderId);
    }
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
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
    } catch (e) {
      toast.error(e.message || 'Не удалось сменить статус');
    } finally {
      setUpdatingId(null);
    }
  };

  const openCreate = async () => {
    setShowCreate(true);
    if (selectedBusiness && products.length === 0) {
      const { data } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('business_id', selectedBusiness.id)
        .eq('is_active', true)
        .order('name');
      if (data) setProducts(data);
    }
  };

  const changeQty = (id, d) => {
    setPicked((prev) => {
      const q = Math.max(0, (prev[id] || 0) + d);
      const next = { ...prev };
      if (q === 0) delete next[id];
      else next[id] = q;
      return next;
    });
  };

  const pickedTotal = Object.entries(picked).reduce((s, [id, q]) => {
    const p = products.find((x) => x.id === id);
    return s + (p ? Number(p.price || 0) * q : 0);
  }, 0);

  const handleCreate = async () => {
    if (!selectedBusiness) return;
    setCreating(true);
    try {
      const items = Object.entries(picked)
        .map(([id, quantity]) => {
          const p = products.find((x) => x.id === id);
          return p ? { product_id: p.id, product_name: p.name, quantity, price: p.price } : null;
        })
        .filter(Boolean);
      await createOrder(selectedBusiness.id, {
        customerName: newOrder.customer_name,
        customerPhone: newOrder.customer_phone,
        deliveryType: newOrder.delivery_type,
        deliveryAddress: newOrder.delivery_address,
        notes: newOrder.notes,
        items,
      });
      toast.success('Заказ создан');
      setShowCreate(false);
      setNewOrder({ customer_name: '', customer_phone: '', delivery_type: 'delivery', delivery_address: '', notes: '' });
      setPicked({});
      loadOrders(selectedBusiness.id, filter);
    } catch (e) {
      toast.error(e.message || 'Не удалось создать заказ');
    } finally {
      setCreating(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
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
        {/* Header */}
        <BusinessSubHeader
          title="Заказы"
          icon={ClipboardList}
          iconClassName="text-blue-600 dark:text-blue-400 flex items-center"
          right={(
            <button onClick={openCreate} disabled={!selectedBusiness}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition flex items-center gap-1.5">
              <Plus size={15} /> Новый заказ
            </button>
          )}
        />

        {/* Create order form */}
        {showCreate && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Новый заказ · {selectedBusiness?.name}</p>
              <button onClick={() => setShowCreate(false)} className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400">
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={newOrder.customer_name} onChange={(e) => setNewOrder({ ...newOrder, customer_name: e.target.value })} placeholder="Имя клиента" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
              <input value={newOrder.customer_phone} onChange={(e) => setNewOrder({ ...newOrder, customer_phone: e.target.value })} placeholder="Телефон" type="tel" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
              <select value={newOrder.delivery_type} onChange={(e) => setNewOrder({ ...newOrder, delivery_type: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100">
                <option value="delivery">Доставка</option>
                <option value="pickup">Самовывоз</option>
                <option value="courier">Курьер Karta-AD</option>
              </select>
              <input value={newOrder.delivery_address} onChange={(e) => setNewOrder({ ...newOrder, delivery_address: e.target.value })} placeholder="Адрес доставки" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
            </div>
            <textarea value={newOrder.notes} onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })} placeholder="Примечание" rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
            {products.length > 0 && (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{p.name} · {formatCurrency(p.price)}</span>
                    <button onClick={() => changeQty(p.id, -1)} className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500"><Minus size={12} /></button>
                    <span className="w-6 text-center font-bold text-slate-800 dark:text-slate-100">{picked[p.id] || 0}</span>
                    <button onClick={() => changeQty(p.id, 1)} className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500"><Plus size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Итого: {formatCurrency(pickedTotal)}</span>
              <button onClick={handleCreate} disabled={creating} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">
                {creating ? 'Создаём…' : 'Создать'}
              </button>
            </div>
          </div>
        )}

        {/* Business Selector */}
        {businesses.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {businesses.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBusiness(b)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  selectedBusiness?.id === b.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по номеру, клиенту, адресу..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  filter === f.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {f.label[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center space-y-2 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="text-4xl">📋</div>
            <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">Нет заказов</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">Заказы появятся здесь, когда клиенты начнут заказывать</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(order.id)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all"
                >
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-sm font-bold text-slate-500 shrink-0">
                    {order.customer_name?.[0] || '#'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">#{order.id.slice(0, 8)}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_LABELS[order.status]?.[lang] || order.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Package size={10} />
                        {order.item_count} товар(ов)
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatTimeAgo(order.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatCurrency(order.total)}</p>
                    <ChevronRight size={14} className={`text-slate-400 ml-auto transition-transform ${expandedOrder === order.id ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {expandedOrder === order.id && (
                  <div className="border-t border-slate-100 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {order.customer_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-400">Клиент:</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200">{order.customer_name}</span>
                        </div>
                      )}
                      {order.customer_phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone size={14} className="text-slate-400" />
                          <span className="font-medium text-slate-700 dark:text-slate-200">{order.customer_phone}</span>
                        </div>
                      )}
                      {order.delivery_address && (
                        <div className="flex items-center gap-2 text-sm sm:col-span-2">
                          <MapPin size={14} className="text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-700 dark:text-slate-200">{order.delivery_address}</span>
                        </div>
                      )}
                      {order.notes && (
                        <div className="text-sm sm:col-span-2">
                          <span className="text-slate-400">Примечание:</span>
                          <p className="font-medium text-slate-700 dark:text-slate-200 mt-0.5">{order.notes}</p>
                        </div>
                      )}
                    </div>

                    {orderItems[order.id] && orderItems[order.id].length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Товары в заказе:</p>
                        <div className="space-y-1.5">
                          {orderItems[order.id].map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-sm bg-white dark:bg-slate-900 rounded-lg px-3 py-2">
                              <span className="text-slate-700 dark:text-slate-200">{item.product_name}</span>
                              <div className="flex items-center gap-3 text-slate-500">
                                <span>x{item.quantity}</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(item.total)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status actions */}
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
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
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
