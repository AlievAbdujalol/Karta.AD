import { Car, DollarSign, Star, Clock } from 'lucide-react';

export default function TaxiStatsBar({ stats }) {
  const items = [
    { label: 'Поездки', value: stats.rides || 0, icon: Car, color: 'text-blue-500' },
    { label: 'Доход', value: `${stats.today || 0}`, icon: DollarSign, color: 'text-emerald-500', suffix: 'TJS' },
    { label: 'Рейтинг', value: (stats.rating || 5.0).toFixed(1), icon: Star, color: 'text-amber-500' },
    { label: 'Онлайн', value: stats.online_minutes || 0, icon: Clock, color: 'text-purple-500', suffix: 'мин' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
      {items.map(({ label, value, icon: Icon, color, suffix }) => (
        <div key={label} className="flex-shrink-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-3 min-w-[72px] text-center border border-white/40 dark:border-slate-700/30">
          <Icon size={14} className={`${color} mx-auto mb-1`} />
          <p className="text-sm font-black text-slate-800 dark:text-slate-100 leading-tight">
            {value}{suffix ? <span className="text-[8px] font-medium text-slate-400 ml-0.5">{suffix}</span> : ''}
          </p>
          <p className="text-[9px] text-slate-400 font-medium mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}
