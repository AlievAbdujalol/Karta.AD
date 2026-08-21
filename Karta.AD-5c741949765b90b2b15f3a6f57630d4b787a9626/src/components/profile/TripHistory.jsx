import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { ArrowUpRight, ArrowDownLeft, History, PiggyBank } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

export default function TripHistory({ user }) {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('all');

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      const { data: tx } = await supabase
        .from('transactions')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      const enriched = (tx || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(enriched);
    };

    load();
  }, [user?.id]);

  const itemLabel = (item) => {
    if (item.sender_id === user?.id && item.recipient_id && item.recipient_id !== item.sender_id) {
      return t('tripHistory.paymentSent');
    }
    if (item.recipient_id === user?.id && item.sender_id && item.sender_id !== item.recipient_id) {
      return t('tripHistory.paymentReceived');
    }
    return t('tripHistory.topup');
  };

  const isSent = (item) => {
    return item.sender_id === user?.id && item.recipient_id && item.recipient_id !== item.sender_id;
  };

  const isReceived = (item) => {
    return item.recipient_id === user?.id && item.sender_id && item.sender_id !== item.recipient_id;
  };

  // Extract unique months
  const months = [...new Set(items.map(i => {
    const d = new Date(i.created_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))].sort().reverse();

  const filtered = selectedMonth === 'all'
    ? items
    : items.filter(i => {
        const d = new Date(i.created_at);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === selectedMonth;
      });

  // Calculate totals for the filtered month
  const totalIncome = filtered
    .filter(i => isReceived(i) || (!isSent(i) && !isReceived(i)))
    .reduce((s, i) => s + Number(i.amount), 0);
  const totalExpense = filtered
    .filter(i => isSent(i))
    .reduce((s, i) => s + Number(i.amount), 0);

  const monthLabel = (m) => {
    if (m === 'all') return t('tripHistory.allMonths');
    const d = new Date(m + '-01');
    return d.toLocaleDateString('ru', { year: 'numeric', month: 'long' });
  };

  if (!items.length) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
        <History size={24} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400">{t('tripHistory.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Month filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedMonth('all')}
          className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors ${
            selectedMonth === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {t('tripHistory.allMonths')}
        </button>
        {months.map(m => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors ${
              selectedMonth === m
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {monthLabel(m)}
          </button>
        ))}
      </div>

      {/* Totals for the month */}
      {filtered.some(i => i._type === 'payment') && (
        <div className="flex gap-3">
          <div className="flex-1 bg-green-50 dark:bg-green-900/20 rounded-xl px-3 py-2 border border-green-100 dark:border-green-800/30">
            <p className="text-[10px] text-green-600 dark:text-green-400 font-semibold">{t('tripHistory.income')}</p>
            <p className="text-sm font-bold text-green-700 dark:text-green-300">+{totalIncome.toFixed(2)} TJS</p>
          </div>
          <div className="flex-1 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2 border border-red-100 dark:border-red-800/30">
            <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold">{t('tripHistory.expense')}</p>
            <p className="text-sm font-bold text-red-700 dark:text-red-300">-{totalExpense.toFixed(2)} TJS</p>
          </div>
        </div>
      )}

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <PiggyBank size={22} className="mx-auto mb-2 text-gray-300" />
          <p className="text-xs text-gray-400">{t('tripHistory.noTransactions')}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(item => {
            const sent = isSent(item);
            const received = isReceived(item);
            const amount = Number(item.amount);
            return (
            <div
              key={item.id}
              className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700"
            >
              <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                sent
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              }`}>
                {sent ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
              </span>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">
                  {itemLabel(item)}
                </p>
                <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
                  {item.status === 'completed' && <span className="text-green-500 font-semibold">{t('profile.transactionStatusCompleted')}</span>}
                  {item.status === 'pending' && <span className="text-yellow-500 font-semibold">{t('profile.transactionStatusPending')}</span>}
                  {item.status === 'cancelled' && <span className="text-red-500 font-semibold">{t('profile.transactionStatusRejected')}</span>}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className={`text-sm font-bold ${sent ? 'text-red-600' : 'text-green-600'}`}>
                  {sent ? '-' : '+'}{amount.toFixed(2)} TJS
                </p>
                <p className="text-[10px] text-gray-400">
                  {new Date(item.created_at).toLocaleDateString('ru', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
