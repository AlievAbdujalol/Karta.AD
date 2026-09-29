import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';
import { BarChart3, DollarSign, ShoppingCart } from 'lucide-react';

export default function BusinessAnalytics() {
  const { user } = useCurrentUser();
  const { lang } = useLanguage();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  const loadBusinesses = async () => {
    const { data, error } = await supabase.rpc('get_my_businesses');
    if (!error && data && data.length > 0) {
      setBusinesses(data);
      setSelectedBusiness(data[0]);
    }
  };

  const loadAnalytics = async (businessId) => {
    if (!businessId) return;
    setLoading(true);
    const { data: s, error: sErr } = await supabase.rpc('get_business_stats', { p_business_id: businessId });
    const { data: o, error: oErr } = await supabase.rpc('get_business_orders', { p_business_id: businessId });
    setLoading(false);
    if (sErr) toast.error('Ошибка статистики');
    else setStats(s?.[0] || null);
    if (oErr) toast.error('Ошибка заказов');
    else setOrders(o || []);
  };

  useEffect(() => {
    if (user?.id) loadBusinesses();
  }, [user?.id]);

  useEffect(() => {
    if (selectedBusiness) loadAnalytics(selectedBusiness.id);
  }, [selectedBusiness?.id]);

  const periodOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    const now = new Date();
    if (period === 'day') return d.toDateString() === now.toDateString();
    if (period === 'week') {
      const weekAgo = new Date(now - 7 * 86400000);
      return d >= weekAgo;
    }
    if (period === 'month') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      return d >= monthAgo;
    }
    return true;
  });

  const totalRevenue = periodOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const avgOrder = periodOrders.length ? totalRevenue / periodOrders.length : 0;
  const completedOrders = periodOrders.filter((o) => o.status === 'completed' || o.status === 'delivered').length;
  const cancelledOrders = periodOrders.filter((o) => o.status === 'cancelled').length;

  const statCards = [
    { label: { ru: 'Выручка', tg: 'Даромад', en: 'Revenue' }, value: `${totalRevenue.toLocaleString('ru-RU')} сом`, icon: DollarSign, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
    { label: { ru: 'Заказы', tg: 'Заказҳо', en: 'Orders' }, value: String(periodOrders.length), icon: ShoppingCart, color: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' },
    { label: { ru: 'Средний чек', tg: 'Миёнаи чек', en: 'Avg check' }, value: `${avgOrder.toLocaleString('ru-RU')} сом`, icon: Currency, color: 'text-purple-500 bg-purple-50 dark:bg-purple-500/10' },
    { label: { ru: 'Завершено', tg: 'Анҷом', en: 'Completed' }, value: String(completedOrders), icon: CheckCircle2, color: 'text-teal-500 bg-teal-50 dark:bg-teal-500/10' },
    { label: { ru: 'Отменено', tg: 'Бекор', en: 'Cancelled' }, value: String(cancelledOrders), icon: XCircle, color: 'text-red-500 bg-red-50 dark:bg-red-500/10' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 size={22} className="text-blue-500" />
            Аналитика
          </h1>
        </div>

        {businesses.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {businesses.map((b) => (
              <button key={b.id} onClick={() => setSelectedBusiness(b)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold ${selectedBusiness?.id === b.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'}`}>
                {b.name}
              </button>
            ))}
          </div>
        )}

        {/* Period tabs */}
        <div className="flex gap-1.5">
          {['day', 'week', 'month', 'all'].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold ${period === p ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500'}`}>
              {{ day: 'Сегодня', week: 'Неделя', month: 'Месяц', all: 'Всё' }[p]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {statCards.map((s) => (
                <div key={s.label[lang]} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.color}`}><s.icon size={18} /></div>
                  <div>
                    <p className="text-[10px] text-slate-400">{s.label[lang]}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Chart placeholder */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">Выручка за период</p>
              <div className="flex items-end gap-1.5 h-32">
                {periodOrders.slice(0, 14).map((o, i) => {
                  const h = Math.max(4, (Number(o.total) / (totalRevenue || 1)) * 100);
                  return (
                    <div key={o.id} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-blue-400 dark:bg-blue-600 rounded-t-sm opacity-70" style={{ height: `${h}%` }} />
                      <span className="text-[8px] text-slate-400">{new Date(o.created_at).getDate()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent orders list */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Последние заказы</p>
              {periodOrders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">#{o.id.slice(0, 8)}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{Number(o.total).toLocaleString('ru-RU')} сом</span>
                  <span className="text-[10px] text-slate-400">{new Date(o.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
              ))}
              {periodOrders.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Нет данных</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Currency(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

function CheckCircle2(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

function XCircle(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
}
