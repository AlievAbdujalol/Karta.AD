import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';
import {
  Key, Plus, Trash2, Copy, Eye, EyeOff, Package, Truck,
  CheckCircle, XCircle, Clock, Phone, User, ExternalLink,
  Loader2, RefreshCw, Ban, Search, Code, FileCode, Cpu,
  Webhook, Activity, Zap, ShieldCheck, Download,
} from 'lucide-react';

const STATUS_MAP = {
  pending: { label: 'Ожидает', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  searching: { label: 'Поиск курьера', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Search },
  assigned: { label: 'Назначен', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', icon: Truck },
  picked_up: { label: 'Забран', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: Package },
  delivered: { label: 'Доставлен', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

export default function DeliveryAdmin() {
  const [tab, setTab] = useState('keys');
  const [keys, setKeys] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newShop, setNewShop] = useState({ shop_name: '', contact_name: '', contact_phone: '', contact_email: '', webhook_url: '' });
  const [creating, setCreating] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState({});
  const [search, setSearch] = useState('');
  const [webhooks, setWebhooks] = useState([]);
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [apiStats, setApiStats] = useState({ requests: 0, sandbox: 0 });

  const loadKeys = useCallback(async () => {
    const { data, error } = await supabase.from('delivery_api_keys')
      .select('*').order('created_at', { ascending: false });
    if (error) { toast.error('Ошибка загрузки ключей'); return; }
    setKeys(data || []);
    setApiStats({
      requests: (data || []).reduce((s, k) => s + (k.requests_count || 0), 0),
      sandbox: (data || []).filter(k => k.is_sandbox).length,
    });
  }, []);

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase.from('delivery_orders')
      .select('*, delivery_api_keys(shop_name)')
      .order('created_at', { ascending: false }).limit(50);
    if (error) { toast.error('Ошибка загрузки заказов'); return; }
    setOrders(data || []);
  }, []);

  const loadWebhooks = useCallback(async () => {
    const [{ data: cfg }, { data: ev }] = await Promise.all([
      supabase.from('delivery_webhook_configs').select('*, delivery_api_keys(shop_name)').order('created_at', { ascending: false }),
      supabase.from('delivery_webhook_events').select('*, delivery_webhook_configs(url)').order('created_at', { ascending: false }).limit(30),
    ]);
    if (cfg) setWebhooks(cfg);
    if (ev) setWebhookEvents(ev);
  }, []);

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from('delivery_api_logs')
      .select('*, delivery_api_keys(shop_name)').order('created_at', { ascending: false }).limit(20);
    if (data) setLogs(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadKeys(), loadOrders(), loadWebhooks(), loadLogs()]).finally(() => setLoading(false));
  }, [loadKeys, loadOrders, loadWebhooks, loadLogs]);

  const createKey = async () => {
    if (!newShop.shop_name.trim()) { toast.error('Укажите название магазина'); return; }
    setCreating(true);
    const { data, error } = await supabase.from('delivery_api_keys').insert({
      shop_name: newShop.shop_name.trim(),
      contact_name: newShop.contact_name.trim() || null,
      contact_phone: newShop.contact_phone.trim() || null,
      contact_email: newShop.contact_email.trim() || null,
      webhook_url: newShop.webhook_url.trim() || null,
    }).select().single();
    setCreating(false);
    if (error) { toast.error('Ошибка создания ключа'); return; }
    toast.success('API-ключ создан');
    setKeys(prev => [data, ...prev]);
    setNewShop({ shop_name: '', contact_name: '', contact_phone: '', contact_email: '', webhook_url: '' });
    setShowCreate(false);
  };

  const toggleActive = async (id, current) => {
    const { error } = await supabase.from('delivery_api_keys').update({ is_active: !current, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Ошибка'); return; }
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: !k.is_active } : k));
    toast.success(current ? 'Ключ деактивирован' : 'Ключ активирован');
  };

  const deleteKey = async (id) => {
    if (!confirm('Удалить API-ключ? Это необратимо.')) return;
    const { error } = await supabase.from('delivery_api_keys').delete().eq('id', id);
    if (error) { toast.error('Ошибка удаления'); return; }
    setKeys(prev => prev.filter(k => k.id !== id));
    toast.success('Ключ удалён');
  };

  const copyKey = (key) => {
    navigator.clipboard.writeText(key).then(() => toast.success('Ключ скопирован'));
  };

  const filteredKeys = keys.filter(k =>
    k.shop_name.toLowerCase().includes(search.toLowerCase()) ||
    k.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredOrders = orders.filter(o =>
    o.delivery_api_keys?.shop_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.order_number?.toString().includes(search) ||
    o.recipient_name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    revenue: orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.price || 0), 0),
  };

  const toggleSandbox = async (id, current) => {
    const { error } = await supabase.from('delivery_api_keys').update({ is_sandbox: !current }).eq('id', id);
    if (error) { toast.error('Ошибка'); return; }
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_sandbox: !k.is_sandbox } : k));
    toast.success(current ? 'Режим Sandbox выключен' : 'Режим Sandbox включён');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black flex items-center gap-2" style={{ color: '#000' }}>
          <Package size={20} className="text-emerald-600" />
          Доставка для магазинов
        </h2>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Всего заказов', value: stats.total, bg: 'bg-slate-600 dark:bg-slate-700', text: 'text-white' },
          { label: 'Ожидают', value: stats.pending, bg: 'bg-amber-500 dark:bg-amber-600', text: 'text-white' },
          { label: 'API запросов', value: apiStats.requests, bg: 'bg-blue-500 dark:bg-blue-600', text: 'text-white' },
          { label: 'Sandbox', value: apiStats.sandbox, bg: 'bg-violet-500 dark:bg-violet-600', text: 'text-white' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} ${s.text} rounded-xl p-3 text-center`}>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[10px] font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex bg-white dark:bg-slate-900 rounded-2xl p-1 shadow-sm border border-slate-200/60 dark:border-slate-700/60">
        {[
          { id: 'keys', label: 'API-ключи', icon: Key },
          { id: 'orders', label: 'Заказы', icon: Package },
          { id: 'couriers', label: 'Курьеры', icon: Truck },
          { id: 'webhooks', label: 'Webhooks', icon: Webhook },
          { id: 'docs', label: 'API-документация', icon: Code },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === t.id ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-emerald-500" />
        </div>
      ) : tab === 'keys' ? (
        <KeysTab showCreate={showCreate} setShowCreate={setShowCreate} newShop={newShop} setNewShop={setNewShop} creating={creating} createKey={createKey} filteredKeys={filteredKeys} revealedKeys={revealedKeys} setRevealedKeys={setRevealedKeys} toggleActive={toggleActive} toggleSandbox={toggleSandbox} deleteKey={deleteKey} copyKey={copyKey} />
      ) : tab === 'orders' ? (
        <OrdersTab filteredOrders={filteredOrders} loadOrders={loadOrders} setLoading={setLoading} />
      ) : tab === 'couriers' ? (
        <CouriersTab />
      ) : tab === 'webhooks' ? (
        <WebhooksTab keys={keys} webhooks={webhooks} webhookEvents={webhookEvents} logs={logs} loadWebhooks={loadWebhooks} loadLogs={loadLogs} setLoading={setLoading} />
      ) : (
        <ApiDocsPanel />
      )}
    </div>
  );
}

function KeysTab({ showCreate, setShowCreate, newShop, setNewShop, creating, createKey, filteredKeys, revealedKeys, setRevealedKeys, toggleActive, toggleSandbox, deleteKey, copyKey }) {
  return (
    <div className="space-y-3">
      <button onClick={() => setShowCreate(!showCreate)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-500/25 transition-colors">
        <Plus size={14} />
        {showCreate ? 'Закрыть' : 'Новый API-ключ'}
      </button>

      {showCreate && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Название магазина *</label>
            <input value={newShop.shop_name} onChange={e => setNewShop(p => ({ ...p, shop_name: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="ООО «Рога и Копыта»" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Контактное лицо</label>
              <input value={newShop.contact_name} onChange={e => setNewShop(p => ({ ...p, contact_name: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="Иван Иванов" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Телефон</label>
              <input value={newShop.contact_phone} onChange={e => setNewShop(p => ({ ...p, contact_phone: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="+992900123456" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</label>
            <input value={newShop.contact_email} onChange={e => setNewShop(p => ({ ...p, contact_email: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="info@shop.tj" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Webhook URL</label>
            <input value={newShop.webhook_url} onChange={e => setNewShop(p => ({ ...p, webhook_url: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="https://shop.tj/api/delivery/webhook" />
          </div>
          <button onClick={createKey} disabled={creating}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 shadow disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
            {creating ? 'Создание...' : 'Создать ключ'}
          </button>
        </div>
      )}

      {filteredKeys.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">Нет API-ключей</div>
      ) : (
        filteredKeys.map(k => (
          <div key={k.id} className={`bg-white dark:bg-slate-900 rounded-2xl p-4 border transition-colors ${
            k.is_active ? 'border-emerald-200/60 dark:border-emerald-800/30' : 'border-slate-200/60 dark:border-slate-700/60 opacity-60'
          }`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{k.shop_name}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${k.is_active ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {k.is_active ? 'Активен' : 'Отключён'}
                  </span>
                  {k.is_sandbox && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                      Sandbox
                    </span>
                  )}
                </div>
                {k.contact_name && (
                  <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <User size={10} />{k.contact_name}
                    {k.contact_phone && <span className="flex items-center gap-0.5 ml-1"><Phone size={10} />{k.contact_phone}</span>}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggleSandbox(k.id, k.is_sandbox)}
                  className={`p-1.5 rounded-lg transition-colors ${k.is_sandbox ? 'text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20' : 'text-slate-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'}`}
                  title={k.is_sandbox ? 'Выключить Sandbox' : 'Включить Sandbox'}>
                  {k.is_sandbox ? <Zap size={14} /> : <Zap size={14} />}
                </button>
                <button onClick={() => toggleActive(k.id, k.is_active)}
                  className={`p-1.5 rounded-lg transition-colors ${k.is_active ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                  title={k.is_active ? 'Деактивировать' : 'Активировать'}>
                  {k.is_active ? <Ban size={14} /> : <CheckCircle size={14} />}
                </button>
                <button onClick={() => deleteKey(k.id)}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Удалить">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5 flex items-center gap-2">
              <Key size={11} className="text-slate-400 flex-shrink-0" />
              <code className="flex-1 text-[10px] text-slate-600 dark:text-slate-300 font-mono truncate">
                {revealedKeys[k.id] ? k.api_key : k.api_key.slice(0, 8) + '••••••••••••'}
              </code>
              <button onClick={() => setRevealedKeys(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors">
                {revealedKeys[k.id] ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
              <button onClick={() => copyKey(k.api_key)}
                className="p-1 rounded text-slate-400 hover:text-emerald-500 transition-colors">
                <Copy size={11} />
              </button>
            </div>

            {k.webhook_url && (
              <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1 truncate">
                <ExternalLink size={9} />{k.webhook_url}
              </p>
            )}
            <p className="text-[9px] text-slate-300 dark:text-slate-600 mt-1">
              Создан: {new Date(k.created_at).toLocaleDateString('ru-RU')}
              {k.requests_count > 0 && <span className="ml-2 text-blue-400 font-bold">API: {k.requests_count} запросов</span>}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

function OrdersTab({ filteredOrders, loadOrders, setLoading }) {
  const [openTracking, setOpenTracking] = useState(null);
  const [trackingData, setTrackingData] = useState({});

  const fetchTracking = async (orderId) => {
    if (trackingData[orderId]) return;
    const { data } = await supabase.from('delivery_tracking')
      .select('status, note, lat, lng, created_at, courier_id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (data) setTrackingData(prev => ({ ...prev, [orderId]: data }));
  };

  return (
    <div className="space-y-3">
      <button onClick={() => { setLoading(true); loadOrders().finally(() => setLoading(false)); }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors">
        <RefreshCw size={12} />Обновить
      </button>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">Нет заказов</div>
      ) : (
        filteredOrders.map(o => {
          const st = STATUS_MAP[o.status] || STATUS_MAP.pending;
          const StIcon = st.icon;
          return (
            <div key={o.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">#{o.order_number}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${st.color}`}>
                    <StIcon size={10} />{st.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {o.courier_id && <span className="flex items-center gap-1 text-[9px] text-indigo-500 font-bold"><Truck size={9} />кур</span>}
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{o.price}с.</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 font-medium">
                {o.delivery_api_keys?.shop_name || 'Неизвестный магазин'}
              </p>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Откуда</p>
                  <p className="text-slate-700 dark:text-slate-200 truncate">{o.pickup_address || '—'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Куда</p>
                  <p className="text-slate-700 dark:text-slate-200 truncate">{o.dropoff_address || '—'}</p>
                </div>
              </div>

              {o.recipient_name && (
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><User size={10} />{o.recipient_name}</span>
                  {o.recipient_phone && <span className="flex items-center gap-1"><Phone size={10} />{o.recipient_phone}</span>}
                </div>
              )}

              {o.item_description && (
                <p className="text-[10px] text-slate-400">Груз: {o.item_description}{o.item_weight_kg > 0 ? ` (${o.item_weight_kg}кг)` : ''}</p>
              )}

              <div className="flex items-center justify-between pt-1">
                <p className="text-[9px] text-slate-300 dark:text-slate-600">
                  {new Date(o.created_at).toLocaleString('ru-RU')}
                </p>
                <button onClick={() => { setOpenTracking(openTracking === o.id ? null : o.id); if (openTracking !== o.id) fetchTracking(o.id); }}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-600 transition-colors">
                  <Activity size={10} />{openTracking === o.id ? 'Скрыть трекинг' : 'Трекинг'}
                </button>
              </div>

              {openTracking === o.id && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 space-y-2">
                  {(trackingData[o.id] || []).length === 0 ? (
                    <p className="text-[10px] text-slate-400 text-center py-2">Записей трекинга нет</p>
                  ) : (
                    trackingData[o.id].map((t, i) => {
                      const ts = STATUS_MAP[t.status === 'courier.location' ? 'searching' : (STATUS_MAP[t.status] ? t.status : 'pending')] || STATUS_MAP.pending;
                      const TsIcon = ts.icon;
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <span className={`mt-0.5 p-0.5 rounded-full ${ts.color}`}><TsIcon size={10} /></span>
                          <div className="flex-1">
                            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                              {ts.label}{t.lat && <span className="ml-1 text-[9px] font-normal text-slate-400">({t.lat.toFixed(4)}, {t.lng?.toFixed(4)})</span>}
                            </p>
                            {t.note && <p className="text-[10px] text-slate-400">{t.note}</p>}
                            <p className="text-[9px] text-slate-300 dark:text-slate-600">{new Date(t.created_at).toLocaleString('ru-RU')}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function WebhooksTab({ keys, webhooks, webhookEvents, logs, loadWebhooks, loadLogs, setLoading }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newCfg, setNewCfg] = useState({ api_key_id: '', url: '', events: ['order.created', 'order.completed', 'order.cancelled'] });
  const [saving, setSaving] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState({});

  const addWebhook = async () => {
    if (!newCfg.api_key_id || !newCfg.url.trim()) { toast.error('Выберите магазин и укажите URL'); return; }
    setSaving(true);
    const { error } = await supabase.from('delivery_webhook_configs').insert({
      api_key_id: newCfg.api_key_id,
      url: newCfg.url.trim(),
      events: newCfg.events,
    });
    setSaving(false);
    if (error) { toast.error('Ошибка создания webhook'); return; }
    toast.success('Webhook создан');
    setShowAdd(false);
    setNewCfg({ api_key_id: '', url: '', events: ['order.created', 'order.completed', 'order.cancelled'] });
    loadWebhooks();
  };

  const toggleWebhook = async (id, current) => {
    const { error } = await supabase.from('delivery_webhook_configs').update({ is_active: !current, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Ошибка'); return; }
    loadWebhooks();
    toast.success(current ? 'Webhook отключён' : 'Webhook включён');
  };

  const deleteWebhook = async (id) => {
    if (!confirm('Удалить webhook?')) return;
    const { error } = await supabase.from('delivery_webhook_configs').delete().eq('id', id);
    if (error) { toast.error('Ошибка'); return; }
    loadWebhooks();
    toast.success('Webhook удалён');
  };

  const EVENT_LABELS = {
    'order.created': 'Заказ создан',
    'order.accepted': 'Заказ принят',
    'order.started': 'Доставка началась',
    'order.completed': 'Доставлен',
    'order.cancelled': 'Отменён',
    'courier.location': 'Местоположение курьера',
    'payment.completed': 'Оплата прошла',
  };

  const toggleEvent = (ev) => {
    setNewCfg(prev => ({
      ...prev,
      events: prev.events.includes(ev) ? prev.events.filter(e => e !== ev) : [...prev.events, ev],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors">
          <Plus size={13} />{showAdd ? 'Закрыть' : 'Новый webhook'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Магазин *</label>
            <select value={newCfg.api_key_id} onChange={e => setNewCfg(p => ({ ...p, api_key_id: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none">
              <option value="">Выберите магазин...</option>
              {(keys || []).filter(k => k.is_active).map(k => (
                <option key={k.id} value={k.id}>{k.shop_name}{k.is_sandbox ? ' (sandbox)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">URL получателя *</label>
            <input value={newCfg.url} onChange={e => setNewCfg(p => ({ ...p, url: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="https://shop.tj/api/delivery/webhook" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">События</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {Object.entries(EVENT_LABELS).map(([ev, label]) => (
                <button key={ev} onClick={() => toggleEvent(ev)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                    newCfg.events.includes(ev)
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={addWebhook} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Webhook size={13} />}
            Создать webhook
          </button>
        </div>
      )}

      {webhooks.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">Нет webhook-конфигураций</div>
      ) : (
        webhooks.map(w => (
          <div key={w.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Webhook size={14} className="text-emerald-500 flex-shrink-0" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {w.delivery_api_keys?.shop_name || 'Магазин'}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggleWebhook(w.id, w.is_active)}
                  className={`p-1.5 rounded-lg transition-colors ${w.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}>
                  {w.is_active ? <Ban size={13} /> : <CheckCircle size={13} />}
                </button>
                <button onClick={() => deleteWebhook(w.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 truncate">{w.url}</p>
            <div className="flex flex-wrap gap-1">
              {(w.events || []).map(ev => (
                <span key={ev} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                  {EVENT_LABELS[ev] || ev}
                </span>
              ))}
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2 flex items-center gap-2">
              <ShieldCheck size={11} className="text-slate-400 flex-shrink-0" />
              <code className="flex-1 text-[9px] text-slate-500 font-mono truncate">
                {revealedSecrets[w.id] ? w.secret : w.secret.slice(0, 8) + '••••••••••••'}
              </code>
              <button onClick={() => setRevealedSecrets(prev => ({ ...prev, [w.id]: !prev[w.id] }))}
                className="text-slate-400 hover:text-slate-600">
                {revealedSecrets[w.id] ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
              <button onClick={() => navigator.clipboard.writeText(w.secret).then(() => toast.success('Секрет скопирован'))}
                className="text-slate-400 hover:text-emerald-500">
                <Copy size={11} />
              </button>
            </div>
            <p className="text-[9px] text-slate-300 dark:text-slate-600">Подпись: X-Karta-Signature = sha256 + HMAC(secret, body)</p>
          </div>
        ))
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Activity size={13} className="text-emerald-500" />
            Журнал webhook-событий
          </h4>
          <button onClick={() => { setLoading(true); loadWebhooks().finally(() => setLoading(false)); }} className="text-slate-400 hover:text-emerald-500">
            <RefreshCw size={12} />
          </button>
        </div>
        {webhookEvents.length === 0 ? (
          <p className="text-center py-4 text-slate-400 text-[10px]">Событий пока нет</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {webhookEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 text-[10px]">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ev.status === 'sent' ? 'bg-green-500' : ev.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                <span className="font-bold text-slate-600 dark:text-slate-300 flex-shrink-0">{EVENT_LABELS[ev.event] || ev.event}</span>
                <span className="text-slate-400 truncate">{ev.delivery_webhook_configs?.url || ''}</span>
                <span className="ml-auto text-slate-300 flex-shrink-0">
                  {ev.status === 'sent' ? `${ev.http_code}` : ev.status}
                  {ev.attempts > 1 ? ` (${ev.attempts})` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Activity size={13} className="text-emerald-500" />
            Журнал API-запросов
          </h4>
          <button onClick={() => { setLoading(true); loadLogs().finally(() => setLoading(false)); }} className="text-slate-400 hover:text-emerald-500">
            <RefreshCw size={12} />
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="text-center py-4 text-slate-400 text-[10px]">Запросов пока нет</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {logs.map(l => (
              <div key={l.id} className="flex items-center gap-2 text-[10px]">
                <span className={`font-mono px-1.5 rounded text-[9px] font-bold ${
                  l.status < 300 ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                  : l.status < 500 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                }`}>{l.status}</span>
                <span className="font-mono text-slate-500">{l.method}</span>
                <span className="text-slate-400 truncate">{l.path}</span>
                <span className="ml-auto text-slate-300 flex-shrink-0">{l.ms}ms</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApiDocsPanel() {
  const [copied, setCopied] = useState(null);

  const copyCode = (code, id) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(id);
      toast.success('Код скопирован');
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const codeExamples = [
    {
      id: 'js',
      title: 'JavaScript / Node.js',
      icon: FileCode,
      code: `const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://eotkmnwneivithfkweds.supabase.co',
  'ВАШ_АНОН_КЛЮЧ'
);

// Создать заказ доставки
const { data, error } = await supabase.rpc('create_delivery_order', {
  p_api_key: 'dk_ВАШ_КЛЮЧ',
  p_pickup_lat: 38.545,
  p_pickup_lng: 68.779,
  p_pickup_address: 'ул. Рудаки, 10',
  p_dropoff_lat: 38.555,
  p_dropoff_lng: 68.789,
  p_dropoff_address: 'ул. Сафарова, 5',
  p_recipient_name: 'Иван Иванов',
  p_recipient_phone: '+992900123456',
  p_item_description: 'Документы',
  p_item_weight_kg: 0.5,
  p_notes: 'Позвонить за 5 минут'
});

console.log(data);
// { id, order_number, price, status, created_at }`,
    },
    {
      id: 'curl',
      title: 'cURL / Terminal',
      icon: Code,
      code: `curl -X POST \\
  'https://eotkmnwneivithfkweds.supabase.co/rest/v1/rpc/create_delivery_order' \\
  -H 'apikey: ВАШ_АНОН_КЛЮЧ' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "p_api_key": "dk_ВАШ_КЛЮЧ",
    "p_pickup_lat": 38.545,
    "p_pickup_lng": 68.779,
    "p_pickup_address": "ул. Рудаки, 10",
    "p_dropoff_lat": 38.555,
    "p_dropoff_lng": 68.789,
    "p_dropoff_address": "ул. Сафарова, 5",
    "p_recipient_name": "Иван Иванов",
    "p_recipient_phone": "+992900123456",
    "p_item_description": "Документы",
    "p_item_weight_kg": 0.5
  }'`,
    },
    {
      id: 'python',
      title: 'Python',
      icon: Cpu,
      code: `from supabase import create_client

supabase = create_client(
    'https://eotkmnwneivithfkweds.supabase.co',
    'ВАШ_АНОН_КЛЮЧ'
)

# Создать заказ
result = supabase.rpc('create_delivery_order', {
    'p_api_key': 'dk_ВАШ_КЛЮЧ',
    'p_pickup_lat': 38.545,
    'p_pickup_lng': 68.779,
    'p_pickup_address': 'ул. Рудаки, 10',
    'p_dropoff_lat': 38.555,
    'p_dropoff_lng': 68.789,
    'p_dropoff_address': 'ул. Сафарова, 5',
    'p_recipient_name': 'Иван Иванов',
    'p_recipient_phone': '+992900123456',
    'p_item_description': 'Документы',
    'p_item_weight_kg': 0.5
}).execute()

print(result.data)`,
    },
    {
      id: 'webhook',
      title: 'Webhook (для AI-ассистентов)',
      icon: Cpu,
      code: `// Автоматическая интеграция с AI-ассистентом
// Магазин настраивает webhook → AI обрабатывает заказы

// 1. Получить все заказы магазина
const { data: orders } = await supabase.rpc('get_shop_orders', {
  p_api_key: 'dk_ВАШ_КЛЮЧ'
});

// 2. AI анализирует и создаёт заказы автоматически
// 3. Статус обновляется в реальном времени через Supabase Realtime

supabase
  .channel('delivery-orders')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'delivery_orders'
  }, (payload) => {
    console.log('Новый статус заказа:', payload);
    // AI может автоматически уведомить клиентов
  })
  .subscribe();`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={18} />
          <h3 className="text-sm font-black">AI-готовый API</h3>
        </div>
        <p className="text-[11px] opacity-90">
          Код готов к копированию. Вставьте в свой проект и замените «ВАШ_КЛЮЧ» на реальный API-ключ из раздела «API-ключи».
        </p>
      </div>

      <div className="space-y-3">
        {codeExamples.map(ex => (
          <div key={ex.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ex.icon size={14} className="text-emerald-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{ex.title}</span>
              </div>
              <button
                onClick={() => copyCode(ex.code, ex.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  copied === ex.id
                    ? 'bg-green-100 text-green-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-emerald-600'
                }`}
              >
                {copied === ex.id ? <CheckCircle size={10} /> : <Copy size={10} />}
                {copied === ex.id ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
            <pre className="p-4 text-[10px] text-slate-600 dark:text-slate-300 overflow-x-auto font-mono leading-relaxed bg-slate-50 dark:bg-slate-950">
              {ex.code}
            </pre>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60 space-y-3">
        <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Package size={14} className="text-emerald-500" />
          Как это работает
        </h4>
        <div className="space-y-2 text-[11px] text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</span>
            <p>Админ создаёт API-ключ для магазина</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</span>
            <p>Магазин копирует код и вставляет в свой сайт/приложение</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</span>
            <p>AI-ассистент автоматически создаёт заказы и отслеживает статус</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">4</span>
            <p>Курьер доставляет — статус обновляется в реальном времени</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60">
        <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
          <Download size={14} className="text-emerald-500" />
          Скачать
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <a href="/delivery/openapi.yaml" download="karta-ad-delivery-openapi.yaml"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:border-emerald-400 transition-colors">
            <FileCode size={13} className="text-emerald-500" />OpenAPI 3.1
          </a>
          <a href="/delivery/postman.json" download="karta-ad-delivery-postman.json"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:border-emerald-400 transition-colors">
            <FileCode size={13} className="text-emerald-500" />Postman
          </a>
        </div>
        <div className="mt-2 bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
          <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">Установка SDK</p>
          <pre className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">npm install @karta-ad/delivery</pre>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200/60 dark:border-amber-800/30">
        <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2">Важно</h4>
        <ul className="text-[10px] text-amber-600 dark:text-amber-300 space-y-1">
          <li>• Замените «ВАШ_КЛЮЧ» на реальный API-ключ</li>
          <li>• Цену рассчитывает автоматически (min 6с., база 4с. + 1.8с./км)</li>
          <li>• Статус обновляется в реальном времени через Supabase Realtime</li>
          <li>• Webhook-подписи: X-Karta-Signature = sha256 + HMAC(secret, body)</li>
          <li>• Rate limit: 60 запросов/минуту на ключ</li>
        </ul>
      </div>
    </div>
  );
}

const COURIER_STATUS = {
  online: { label: 'На линии', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  busy: { label: 'Занят', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  offline: { label: 'Не в сети', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

function CouriersTab() {
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('delivery_couriers')
      .select('*, profiles(full_name, phone, avatar_url)')
      .order('last_seen', { ascending: false });
    setCouriers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleVerify = async (id, current) => {
    const { error } = await supabase.from('delivery_couriers').update({ is_verified: !current }).eq('user_id', id);
    if (error) { toast.error('Ошибка'); return; }
    toast.success(current ? 'Курьер заблокирован' : 'Курьер верифицирован');
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors">
          <RefreshCw size={12} />Обновить
        </button>
        <span className="text-[10px] text-slate-400">
          Всего: <b className="text-slate-600 dark:text-slate-300">{couriers.length}</b> · На линии:{' '}
          <b className="text-green-500">{couriers.filter(c => c.status === 'online').length}</b>
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-emerald-500" />
        </div>
      ) : couriers.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          Курьеры не зарегистрированы. Они появятся после регистрации в приложении.
        </div>
      ) : (
        couriers.map(c => {
          const st = COURIER_STATUS[c.status] || COURIER_STATUS.offline;
          return (
            <div key={c.user_id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {c.profiles?.full_name || 'Курьер'}
                    </p>
                    <p className="text-[10px] text-slate-400">{c.profiles?.phone || '—'}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${st.color}`}>{st.label}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{c.deliveries_count || 0}</p>
                  <p className="text-[9px] text-slate-400 font-medium">Доставок</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2">
                  <p className="text-sm font-bold text-amber-500">{c.rating || 5}</p>
                  <p className="text-[9px] text-slate-400 font-medium">Рейтинг</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-2">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {c.lat ? c.lat.toFixed(4) + ', ' + c.lng.toFixed(4) : '—'}
                  </p>
                  <p className="text-[9px] text-slate-400 font-medium">Геопозиция</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[9px] text-slate-300 dark:text-slate-600">
                  Последний раз: {c.last_seen ? new Date(c.last_seen).toLocaleString('ru-RU') : 'никогда'}
                </p>
                <button
                  onClick={() => toggleVerify(c.user_id, c.is_verified)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    c.is_verified
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/30'
                      : 'bg-red-50 text-red-500 border border-red-200 dark:bg-red-900/20 dark:border-red-800/30'
                  }`}>
                  <ShieldCheck size={10} />{c.is_verified ? 'Верифицирован' : 'Заблокирован'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
