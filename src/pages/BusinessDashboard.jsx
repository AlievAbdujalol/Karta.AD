import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { isBusinessRoleActive, BUSINESS_MONTHLY_FEE } from '@/lib/roles';
import { useLanguage } from '@/lib/useLanguage';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Plus, Store, MapPin, Phone, Users, ChevronRight, Home, Map, ShoppingBag,
  Truck, ClipboardList, Bot, BarChart3, CreditCard, MessageSquare, Settings,
  Package, TrendingUp, TrendingDown, ExternalLink, MoreHorizontal, Crown, Bell,
  Globe, Pencil,
} from 'lucide-react';
import { revenueTrend } from '@/lib/business';

const ROLE_LABELS = {
  owner: { ru: 'Владелец', tg: 'Соҳиб', en: 'Owner' },
  manager: { ru: 'Менеджер', tg: 'Мудир', en: 'Manager' },
  employee: { ru: 'Сотрудник', tg: 'Корманд', en: 'Employee' },
  courier: { ru: 'Курьер', tg: 'Курьер', en: 'Courier' },
};

const BUSINESS_TYPES = [
  { value: 'shop', ru: 'Магазин', tg: 'Мағоза', en: 'Shop' },
  { value: 'restaurant', ru: 'Ресторан', tg: 'Ресторан', en: 'Restaurant' },
  { value: 'pharmacy', ru: 'Аптека', tg: 'Дорухона', en: 'Pharmacy' },
  { value: 'services', ru: 'Услуги', tg: 'Хизматҳо', en: 'Services' },
  { value: 'other', ru: 'Другое', tg: 'Дигар', en: 'Other' },
];

const SIDEBAR_ITEMS = [
  { key: 'home', icon: Home, label: { ru: 'Главная', tg: 'Асосӣ', en: 'Home' }, to: '/business' },
  { key: 'map', icon: Map, label: { ru: 'Карта', tg: 'Харита', en: 'Map' }, to: '/' },
  { key: 'shops', icon: ShoppingBag, label: { ru: 'Магазины', tg: 'Мағозаҳо', en: 'Shops' }, to: '/business/products' },
  { key: 'delivery', icon: Truck, label: { ru: 'Доставка', tg: 'Доставка', en: 'Delivery' }, to: '/business/delivery' },
  { key: 'orders', icon: ClipboardList, label: { ru: 'Мои заказы', tg: 'Фармоиши ман', en: 'My Orders' }, to: '/business/orders' },
  { key: 'business', icon: Store, label: { ru: 'Мой бизнес', tg: 'Бизнеси ман', en: 'My Business' }, to: '/business', active: true },
  { key: 'ai', icon: Bot, label: { ru: 'AI Директор', tg: 'AI Директор', en: 'AI Director' }, to: '/business/ai' },
  { key: 'analytics', icon: BarChart3, label: { ru: 'Аналитика', tg: 'Аналитика', en: 'Analytics' }, to: '/business/analytics' },
  { key: 'payments', icon: CreditCard, label: { ru: 'Платежи', tg: 'Пардохтҳо', en: 'Payments' }, soon: true },
  { key: 'messages', icon: MessageSquare, label: { ru: 'Сообщения', tg: 'Паёмҳо', en: 'Messages' }, soon: true },
  { key: 'settings', icon: Settings, label: { ru: 'Настройки', tg: 'Танзимот', en: 'Settings' }, to: '/business/settings' },
];

const QUICK_ACTIONS = [
  { key: 'products', icon: Package, label: { ru: 'Товары', tg: 'Молҳо', en: 'Products' }, desc: { ru: 'Добавить, редактировать', tg: 'Илова, таҳрир', en: 'Add, edit' }, color: 'bg-emerald-500', to: '/business/products' },
  { key: 'orders', icon: ClipboardList, label: { ru: 'Заказы', tg: 'Фармоишҳо', en: 'Orders' }, desc: { ru: 'Новые заказы, статусы', tg: 'Фармоишҳои нав, статусҳо', en: 'New orders, statuses' }, color: 'bg-blue-500', to: '/business/orders' },
  { key: 'delivery', icon: Truck, label: { ru: 'Доставка', tg: 'Доставка', en: 'Delivery' }, desc: { ru: 'Курьеры, маршруты', tg: 'Курьерҳо, маршрутҳо', en: 'Couriers, routes' }, color: 'bg-orange-500', to: '/business/delivery' },
  { key: 'analytics', icon: BarChart3, label: { ru: 'Аналитика', tg: 'Аналитика', en: 'Analytics' }, desc: { ru: 'Продажи, отчёты', tg: 'Фурӯш, ҳисоботҳо', en: 'Sales, reports' }, color: 'bg-purple-500', to: '/business/analytics' },
];

const STATUS_LABELS = {
  pending: { ru: 'Ожидает', tg: 'Интизор', en: 'Pending' },
  confirmed: { ru: 'Подтверждён', tg: 'Тасдиқ', en: 'Confirmed' },
  paid: { ru: 'Оплачен', tg: 'Пардохт', en: 'Paid' },
  preparing: { ru: 'Готовится', tg: 'Тайёр', en: 'Preparing' },
  ready: { ru: 'Готов', tg: 'Тайёр', en: 'Ready' },
  in_transit: { ru: 'В пути', tg: 'Роҳ', en: 'In transit' },
  delivered: { ru: 'Доставлен', tg: 'Расонда', en: 'Delivered' },
  completed: { ru: 'Завершён', tg: 'Анҷом', en: 'Completed' },
  cancelled: { ru: 'Отменён', tg: 'Бекор', en: 'Cancelled' },
};

export default function BusinessDashboard() {
  const { user } = useCurrentUser();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', city: '', address: '', phone: '' });
  const [tab, setTab] = useState('admin');
  const [publishedSite, setPublishedSite] = useState(null);
  const [siteLoading, setSiteLoading] = useState(false);

  const loadBusinesses = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_businesses');
    setLoading(false);
    if (error) {
      toast.error(t('business.loadError'));
      return;
    }
    setBusinesses(data || []);
    if (data && data.length > 0 && !selectedBusiness) {
      setSelectedBusiness(data[0]);
    }
  };

  const loadStats = async (businessId) => {
    if (!businessId) return;
    const { data, error } = await supabase.rpc('get_business_stats', { p_business_id: businessId });
    if (!error) setStats(data);
  };

  const loadOrders = async (businessId) => {
    if (!businessId) return;
    const { data, error } = await supabase.rpc('get_business_orders', { p_business_id: businessId });
    if (!error) setOrders(data || []);
  };

  useEffect(() => {
    if (user?.id) loadBusinesses();
  }, [user?.id]);

  useEffect(() => {
    if (selectedBusiness) {
      loadStats(selectedBusiness.id);
      loadOrders(selectedBusiness.id);
      loadPublishedSite(selectedBusiness.id);
    }
  }, [selectedBusiness?.id]);

  const loadPublishedSite = async (businessId) => {
    if (!businessId) return;
    setSiteLoading(true);
    try {
      const { data: projs } = await supabase
        .from('ai_projects')
        .select('id')
        .eq('business_id', businessId);
      const ids = (projs || []).map((p) => p.id);
      if (!ids.length) {
        setPublishedSite(null);
        return;
      }
      const { data } = await supabase
        .from('ai_project_versions')
        .select('id, version, title, html, created_at')
        .in('project_id', ids)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPublishedSite(data || null);
    } catch {
      setPublishedSite(null);
    } finally {
      setSiteLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t('business.nameRequired'));
      return;
    }
    // Роль «Бизнес» обязательна — сервер тоже проверит (create_business)
    if (!isBusinessRoleActive(user)) {
      toast.error(`Требуется активная подписка «Бизнес» (${BUSINESS_MONTHLY_FEE} TJS/мес)`);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc('create_business', {
      p_name: form.name.trim(),
      p_type: form.type || null,
      p_city: form.city || null,
      p_address: form.address || null,
      p_phone: form.phone || null,
    });
    setSubmitting(false);
    if (error) {
      const msg = error.message || '';
      toast.error(
        msg.includes('роль Бизнес') || msg.includes('Подписка')
          ? msg
          : t('business.createError')
      );
      return;
    }
    toast.success(t('business.createSuccess'));
    setForm({ name: '', type: '', city: '', address: '', phone: '' });
    setShowForm(false);
    loadBusinesses();
  };

  const roleLabel = (role) => ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.ru || role;
  const typeLabel = (type) => BUSINESS_TYPES.find((bt) => bt.value === type)?.[lang] || type;
  const statusLabel = (status) => STATUS_LABELS[status]?.[lang] || status;

  const formatNumber = (n) => {
    if (!n) return '0';
    return new Intl.NumberFormat('ru-RU').format(n);
  };

  const formatCurrency = (n) => {
    if (!n) return '0';
    return `${formatNumber(n)} сом`;
  };

  const trend = revenueTrend(orders);
  const goSoon = () => toast.info('Раздел скоро появится');

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <Store size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Karta-AD</p>
              <p className="text-[10px] text-slate-400">Business</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => (item.to ? navigate(item.to) : goSoon())}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                item.active
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <item.icon size={18} />
              {item.label[lang]}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <div className="bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl p-3 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Bot size={16} />
              <span className="text-xs font-bold">AI помогает развивать ваш бизнес</span>
            </div>
              <button onClick={() => navigate('/business/ai')} className="w-full mt-2 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold py-1.5 rounded-lg transition-all">
                Создать с AI →
              </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center md:hidden">
                <Store size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Store size={20} className="text-blue-600 dark:text-blue-400" />
                  {t('business.title')}
                </h1>
                <p className="text-xs text-slate-400 hidden md:block">Управляйте своими магазинами, услугами и доставкой в экосистеме Karta-AD</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!isBusinessRoleActive(user)) {
                    toast.error(`Роль «Бизнес» не активна. Активируйте подписку за ${BUSINESS_MONTHLY_FEE} TJS/мес в профиле.`);
                    navigate('/profile');
                    return;
                  }
                  setShowForm((v) => !v);
                }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 md:px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">{t('business.create')}</span>
              </button>
              <button onClick={() => navigate('/business/orders')} className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all" title="Заказы">
                <Bell size={20} className="text-slate-500" />
                {orders.some((o) => o.status === 'pending') && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
              <button onClick={() => navigate('/profile')} className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                {user?.full_name?.[0] || user?.email?.[0] || 'U'}
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-6xl mx-auto">
          {/* Create Form */}
          {showForm && (
            <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 space-y-3 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t('business.name')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('business.type')}</option>
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.value} value={bt.value}>{bt[lang]}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder={t('business.city')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder={t('business.address')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder={t('business.phone')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 md:flex-none md:px-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                >
                  {submitting ? t('loading') : t('business.create')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          )}

          {/* Разделы: админ-панель и AI-сайт */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {[
              { id: 'admin', label: 'Админ-панель', icon: Settings },
              { id: 'site', label: 'AI-сайт', icon: Globe },
            ].map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  tab === tb.id
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <tb.icon size={15} />
                {tb.label}
              </button>
            ))}
          </div>

          {tab === 'site' ? (
            <div className="space-y-4">
              {!selectedBusiness ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800">
                  <p className="text-sm text-slate-500">Сначала создай бизнес во вкладке «Админ-панель»</p>
                </div>
              ) : siteLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : publishedSite ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center gap-2 p-4 border-b border-slate-100 dark:border-slate-800 flex-wrap">
                    <Globe size={16} className="text-emerald-500" />
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1">
                      {publishedSite.title || 'Сайт'} · v{publishedSite.version}
                    </p>
                    <a
                      href={`/s/${publishedSite.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold"
                    >
                      <ExternalLink size={12} /> Открыть
                    </a>
                    <button
                      onClick={() => navigate('/business/ai')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold"
                    >
                      <Pencil size={12} /> Изменить
                    </button>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-950 p-3">
                    <iframe
                      title="Опубликованный сайт"
                      srcDoc={publishedSite.html}
                      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                      style={{ width: '100%', height: 480, borderRadius: 12, border: '1px solid rgba(148,163,184,.3)', background: '#fff' }}
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-500 rounded-2xl p-6 text-white text-center">
                  <p className="text-lg font-bold">Сайта пока нет</p>
                  <p className="text-sm opacity-80 mt-1 mb-4">AI создаст витрину с каталогом и корзиной за минуту</p>
                  <button
                    onClick={() => navigate('/business/ai')}
                    className="bg-white text-blue-600 px-5 py-2.5 rounded-xl text-sm font-bold"
                  >
                    Создать в AI-конструкторе →
                  </button>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : businesses.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center space-y-3 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="text-4xl">{isBusinessRoleActive(user) ? '🏪' : '🔒'}</div>
              {isBusinessRoleActive(user) ? (
                <>
                  <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">{t('business.empty')}</p>
                  <p className="text-slate-400 dark:text-slate-500 text-xs">{t('business.emptyHint')}</p>
                </>
              ) : (
                <>
                  <p className="text-slate-700 dark:text-slate-200 text-sm font-bold">Нужна роль «Бизнес»</p>
                  <p className="text-slate-400 dark:text-slate-500 text-xs max-w-sm mx-auto">
                    Подписка «Бизнес» — {BUSINESS_MONTHLY_FEE} TJS/мес. Открывает создание бизнеса, товары, заказы, доставку, AI-сайт и аналитику.
                  </p>
                  <button
                    onClick={() => navigate('/profile')}
                    className="inline-flex items-center gap-1.5 mt-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-bold hover:opacity-90"
                  >
                    Активировать в профиле
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Business Card */}
              {selectedBusiness && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shrink-0">
                          <Store size={24} className="text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{selectedBusiness.name}</h2>
                            <span className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              {t('active')}
                            </span>
                          </div>
                          {selectedBusiness.type && (
                            <p className="text-xs text-slate-400 mt-0.5">{typeLabel(selectedBusiness.type)}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {selectedBusiness.city && (
                              <span className="flex items-center gap-1">
                                <MapPin size={12} />
                                {selectedBusiness.city}
                              </span>
                            )}
                            {selectedBusiness.phone && (
                              <span className="flex items-center gap-1">
                                <Phone size={12} />
                                {selectedBusiness.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                          <Crown size={11} />
                          {roleLabel(selectedBusiness.role)}
                        </span>
                        <button onClick={() => navigate('/business/settings')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all" title="Настройки">
                          <MoreHorizontal size={16} className="text-slate-400" />
                        </button>
                      </div>
                    </div>

                    {/* Stats */}
                    {stats && (
                      <div className="grid grid-cols-3 gap-3 mt-4">
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                          <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <Package size={14} />
                            <span className="text-[11px] font-medium">Заказы</span>
                          </div>
                          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatNumber(stats.total_orders)}</p>
                          <p className="text-[11px] text-slate-400 font-medium">активных: {formatNumber(stats.active_orders)}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                          <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <BarChart3 size={14} />
                            <span className="text-[11px] font-medium">Продажи</span>
                          </div>
                          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatCurrency(stats.total_revenue)}</p>
                          {trend ? (
                            <p className={`text-[11px] font-medium flex items-center gap-0.5 ${trend.pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {trend.pct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {trend.pct >= 0 ? '+' : ''}{trend.pct}% к нед.
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 font-medium">мало данных</p>
                          )}
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                          <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <Users size={14} />
                            <span className="text-[11px] font-medium">Клиенты</span>
                          </div>
                          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatNumber(stats.total_customers)}</p>
                          <p className="text-[11px] text-slate-400 font-medium">сегодня: {formatNumber(stats.orders_today)}</p>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                      <button onClick={() => toast.info('Публичная витрина появится в следующей фазе')} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95">
                        <ExternalLink size={14} />
                        Открыть
                      </button>
                      <button onClick={() => navigate('/business/settings')} className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-sm font-semibold transition-all">
                        <Settings size={14} />
                        Управление
                      </button>
                      <button onClick={() => navigate('/business/products')} className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-sm font-semibold transition-all">
                        <Package size={14} />
                        Товары
                      </button>
                      <button onClick={() => navigate('/business/orders')} className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-sm font-semibold transition-all">
                        <ClipboardList size={14} />
                        Заказы
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Banner */}
              <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-500 rounded-2xl p-4 md:p-5 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <Bot size={18} />
                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">Karta-AD AI</span>
                  </div>
                  <h3 className="text-lg md:text-xl font-bold mb-1">Создать бизнес с AI</h3>
                  <p className="text-sm opacity-80 mb-3 max-w-md">AI поможет создать сайт или магазин, настроить товары, подключить оплату, карту и доставку Karta-AD за несколько минут.</p>
                  <button onClick={() => navigate('/business/ai')} className="bg-white text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95">
                    Создать бизнес с AI →
                  </button>
                </div>
                <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4" />
                <div className="absolute right-12 bottom-0 w-20 h-20 bg-white/10 rounded-full translate-y-1/2" />
              </div>

              {/* Quick Actions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Быстрые действия</h3>
                  <button onClick={() => navigate('/business/settings')} className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                    Все инструменты
                    <ChevronRight size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.key}
                      onClick={() => navigate(action.to)}
                      className="bg-white dark:bg-slate-900 rounded-xl p-3 text-left shadow-sm border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all group"
                    >
                      <div className={`w-9 h-9 ${action.color} rounded-lg flex items-center justify-center mb-2`}>
                        <action.icon size={16} className="text-white" />
                      </div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{action.label[lang]}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{action.desc[lang]}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent Orders + Delivery */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Recent Orders */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Последние заказы</h3>
                    <button onClick={() => navigate('/business/orders')} className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                      Все заказы
                      <ChevronRight size={12} />
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {orders.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-400">Нет заказов</div>
                    ) : (
                      orders.slice(0, 5).map((order, idx) => (
                        <div key={order.id} className="p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all">
                          <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                            {order.customer_name?.[0] || idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">#{order.id.slice(0, 6)}</span>
                              <span className="text-[11px] text-slate-400">{order.item_count} товар(ов)</span>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {order.delivery_address || order.customer_name || '—'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatCurrency(order.total)}</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              order.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' :
                              order.status === 'in_transit' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10' :
                              order.status === 'cancelled' ? 'bg-red-50 text-red-600 dark:bg-red-500/10' :
                              'bg-amber-50 text-amber-600 dark:bg-amber-500/10'
                            }`}>
                              {statusLabel(order.status)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Delivery Map */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Доставка по Karta-AD</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Подключите доставку, чтобы клиенты могли заказывать товары с доставкой на карте.</p>
                  </div>
                  <div className="h-40 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center relative">
                    <div className="absolute inset-0 opacity-20">
                      <div className="absolute top-4 left-4 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                      <div className="absolute top-8 right-8 w-2 h-2 bg-emerald-500 rounded-full" />
                      <div className="absolute bottom-6 left-1/3 w-2 h-2 bg-amber-500 rounded-full" />
                      <div className="absolute top-1/2 right-1/4 w-4 h-4 border-2 border-blue-500 rounded-full" />
                    </div>
                    <div className="text-center z-10">
                      <Truck size={32} className="text-blue-500 mx-auto mb-1" />
                      <p className="text-xs text-slate-500 dark:text-slate-400">Карта доставки</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <button onClick={() => navigate('/business/delivery')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95">
                      Настроить доставку →
                    </button>
                  </div>
                </div>
              </div>

              {/* Business List (if multiple) */}
              {businesses.length > 1 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">Все бизнесы</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {businesses.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBusiness(b)}
                        className={`bg-white dark:bg-slate-900 rounded-xl p-4 text-left shadow-sm border transition-all ${
                          selectedBusiness?.id === b.id
                            ? 'border-blue-500 ring-2 ring-blue-500/20'
                            : 'border-slate-200 dark:border-slate-800 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-800 dark:text-slate-100 truncate">{b.name}</h4>
                            {b.type && <p className="text-xs text-slate-400">{typeLabel(b.type)}</p>}
                          </div>
                          <span className="shrink-0 flex items-center gap-1 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                            <Users size={11} />
                            {roleLabel(b.role)}
                          </span>
                        </div>
                        {(b.city || b.address) && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-2">
                            <MapPin size={12} className="shrink-0" />
                            <span className="truncate">{[b.city, b.address].filter(Boolean).join(', ')}</span>
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
