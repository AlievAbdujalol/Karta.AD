import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, DollarSign, TrendingUp, Wallet, Download, Car, Landmark } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatTJS, TAXI_COMMISSION } from '@/lib/taxi';

const PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
];

function periodStart(period) {
  const now = new Date();
  if (period === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
  if (period === 'week') { const d = new Date(now); d.setDate(now.getDate() - 7); return d; }
  if (period === 'month') { const d = new Date(now); d.setMonth(now.getMonth() - 1); return d; }
  const d = new Date(now); d.setFullYear(now.getFullYear() - 1); return d;
}

// Группировка доходов по дням/неделям/месяцам для диаграммы
function buildChartData(orders, period) {
  const buckets = new Map();
  const fmt = period === 'year'
    ? (d) => d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')
    : period === 'month'
      ? (d) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
      : (d) => d.toLocaleDateString('ru-RU', { weekday: 'short' });

  for (const o of orders || []) {
    const d = new Date(o.created_at);
    const key = fmt(d);
    buckets.set(key, (buckets.get(key) || 0) + (parseFloat(o.price) || 0));
  }
  const todayKey = fmt(new Date());
  if (!buckets.has(todayKey)) buckets.set(todayKey, 0);
  return [...buckets.entries()].slice(-10).map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }));
}

export default function TaxiFinance() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('today');
  const [data, setData] = useState({ total: 0, rides: 0, avg: 0, commission: 0, net: 0 });
  const [chart, setChart] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchFinance = async () => {
      const from = periodStart(period);
      const { data: orders } = await supabase.from('taxi_orders')
        .select('id, price, created_at')
        .eq('driver_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', from.toISOString());

      const total = (orders || []).reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
      const rides = (orders || []).length;
      const commission = Math.round(total * TAXI_COMMISSION * 100) / 100;
      setData({ total, rides, avg: rides ? total / rides : 0, commission, net: total - commission });
      setChart(buildChartData(orders, period));

      const { data: tx } = await supabase.from('taxi_wallet_transactions')
        .select('*').eq('driver_id', user.id)
        .order('created_at', { ascending: false }).limit(20);
      setTransactions(tx || []);
    };
    fetchFinance();
  }, [user?.id, period]);

  const balance = useMemo(() =>
    transactions.filter(t => t.type !== 'withdrawal').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    - transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0),
  [transactions]);

  const txLabel = { earnings: 'Доход за поездку', withdrawal: 'Вывод', bonus: 'Бонус', commission: 'Комиссия', refund: 'Возврат' };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-sm font-bold">Финансы</h1>
          <p className="text-[10px] text-slate-400">Доход, комиссия, вывод средств</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Period selector */}
        <div className="flex gap-2 bg-white dark:bg-slate-900 rounded-2xl p-1 border border-gray-100 dark:border-slate-800">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${period === p.id ? 'bg-blue-600 text-white shadow' : 'text-gray-500'}`}
            >{p.label}</button>
          ))}
        </div>

        {/* Main card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 text-white">
          <p className="text-xs text-white/60 font-medium">Доход</p>
          <p className="text-4xl font-black mt-1">{formatTJS(data.total)} <span className="text-lg font-bold text-white/70">TJS</span></p>
          <p className="text-xs text-white/50 mt-1">{data.rides} поездок · Средний чек {formatTJS(data.avg)} TJS</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800">
            <DollarSign size={16} className="text-slate-400 mb-2" />
            <p className="text-lg font-black text-slate-800 dark:text-slate-100">{formatTJS(data.commission)} TJS</p>
            <p className="text-[10px] text-slate-400">Комиссия ({(TAXI_COMMISSION * 100).toFixed(0)}%)</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800">
            <TrendingUp size={16} className="text-emerald-500 mb-2" />
            <p className="text-lg font-black text-emerald-600">{formatTJS(data.net)} TJS</p>
            <p className="text-[10px] text-slate-400">Чистая прибыль</p>
          </div>
        </div>

        {/* Income chart */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Динамика дохода</p>
            <Car size={14} className="text-slate-300" />
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                  contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 12, fontSize: 11, color: '#fff' }}
                  formatter={(v) => [`${v} TJS`, 'Доход']}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chart.map((_, i) => (
                    <Cell key={i} fill={i === chart.length - 1 ? '#3b82f6' : '#93c5fd'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Wallet */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 rounded-3xl p-6 text-white flex items-center justify-between">
          <div>
            <p className="text-xs text-white/60 font-medium flex items-center gap-1"><Landmark size={12} /> Кошелёк</p>
            <p className="text-3xl font-black mt-1">{formatTJS(balance)} <span className="text-sm font-bold text-white/70">TJS</span></p>
          </div>
          <button
            onClick={() => toast.info('Вывод средств будет доступен в ближайшее время')}
            className="px-5 py-3 rounded-2xl bg-white/20 backdrop-blur text-white font-bold text-xs flex items-center gap-2 hover:bg-white/30 transition-all active:scale-[0.97]"
          >
            <Download size={14} />
            Вывести
          </button>
        </div>

        {/* Transaction history */}
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">История операций</h3>
          {transactions.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center py-8">
              <Wallet size={24} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Пока нет операций</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map(tx => (
                <div key={tx.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${tx.type === 'earnings' ? 'bg-emerald-100 dark:bg-emerald-900/30' : tx.type === 'withdrawal' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                      {tx.type === 'earnings' ? <TrendingUp size={14} className="text-emerald-600" /> : tx.type === 'withdrawal' ? <Download size={14} className="text-red-500" /> : <Wallet size={14} className="text-blue-500" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{txLabel[tx.type] || tx.type}</p>
                      <p className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-black ${tx.type === 'withdrawal' ? 'text-red-500' : 'text-emerald-600'}`}>
                    {tx.type === 'withdrawal' ? '-' : '+'}{formatTJS(tx.amount)} TJS
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
