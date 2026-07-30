import { useState, useEffect } from 'react';
import { ArrowLeft, DollarSign, TrendingUp, Wallet, Download } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function TaxiFinance() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('today');
  const [data, setData] = useState({ total: 0, rides: 0, avg: 0, commission: 0, net: 0 });
  const [payouts, setPayouts] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchFinance = async () => {
      const now = new Date();
      let from;
      if (period === 'today') { from = new Date(now); from.setHours(0,0,0,0); }
      else if (period === 'week') { from = new Date(now); from.setDate(now.getDate() - 7); }
      else if (period === 'month') { from = new Date(now); from.setMonth(now.getMonth() - 1); }
      else { from = new Date(now); from.setFullYear(now.getFullYear() - 1); }

      const { data: orders } = await supabase.from('taxi_orders')
        .select('id, price, created_at')
        .eq('driver_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', from.toISOString());

      const total = (orders || []).reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
      const rides = (orders || []).length;
      const commission = total * 0.2;
      setData({ total, rides, avg: rides ? (total / rides).toFixed(0) : 0, commission: commission.toFixed(0), net: (total - commission).toFixed(0) });
    };
    fetchFinance();
  }, [user?.id, period]);

  const periods = [
    { id: 'today', label: 'Сегодня' },
    { id: 'week', label: 'Неделя' },
    { id: 'month', label: 'Месяц' },
    { id: 'year', label: 'Год' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">Финансы</h1>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Period selector */}
        <div className="flex gap-2 bg-white dark:bg-slate-900 rounded-2xl p-1 border border-gray-100 dark:border-slate-800">
          {periods.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${period === p.id ? 'bg-blue-600 text-white shadow' : 'text-gray-500'}`}
            >{p.label}</button>
          ))}
        </div>

        {/* Main card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 text-white">
          <p className="text-xs text-white/60 font-medium">Доход</p>
          <p className="text-4xl font-black mt-1">{data.total} <span className="text-lg font-bold text-white/70">TJS</span></p>
          <p className="text-xs text-white/50 mt-1">{data.rides} поездок · Средний чек {data.avg} TJS</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800">
            <DollarSign size={16} className="text-slate-400 mb-2" />
            <p className="text-lg font-black text-slate-800 dark:text-slate-100">{data.commission} TJS</p>
            <p className="text-[10px] text-slate-400">Комиссия (20%)</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800">
            <TrendingUp size={16} className="text-emerald-500 mb-2" />
            <p className="text-lg font-black text-emerald-600">{data.net} TJS</p>
            <p className="text-[10px] text-slate-400">Чистая прибыль</p>
          </div>
        </div>

        {/* Withdraw */}
        <button
          onClick={() => toast.info('Вывод средств будет доступен в ближайшее время')}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all"
        >
          <Download size={16} />
          Вывод средств
        </button>

        {/* Payout history */}
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">История выплат</h3>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center py-8">
            <Wallet size={24} className="text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Пока нет выплат</p>
          </div>
        </div>
      </div>
    </div>
  );
}
