import { PASSENGER_TARIFFS, formatTJS } from '@/lib/taxi';

export default function TaxiCategoryCard({ selected, onSelect, priceInfo, compact, demandCoef }) {
  const isSurge = (Number(demandCoef) || 1) > 1;

  return (
    <div className={`overflow-x-auto scrollbar-hide ${compact ? '-mx-4 px-4' : ''}`}>
      <div className={`flex gap-2 ${compact ? '' : 'flex-col'}`}>
        {PASSENGER_TARIFFS.map(cat => {
          const Icon = cat.icon;
          const isActive = selected === cat.id;
          const info = priceInfo?.[cat.id] || {};
          const price = info.price ?? null;
          const eta = info.eta ?? null;
          const cars = info.cars ?? 0;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`flex-shrink-0 transition-all duration-200 ${
                compact
                  ? `flex flex-col items-center gap-1 px-2.5 py-2 rounded-2xl border-2 min-w-[84px] ${
                      isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-500/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`
                  : `flex items-center gap-3 p-3 rounded-xl border-2 w-full ${
                      isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`
              }`}
            >
              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${cat.gradient} flex items-center justify-center shadow-md`}>
                <Icon size={compact ? 14 : 16} className="text-white" />
              </div>
              <div className={compact ? 'text-center' : 'flex-1'}>
                <p className={`font-bold ${compact ? 'text-[10px]' : 'text-xs'}`}>{cat.short}</p>
                {!compact && <p className="text-[10px] text-slate-400">{cat.desc}</p>}
              </div>
              {!compact && (
                <div className="text-right">
                  <p className={`text-xs font-black ${isSurge && price ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}`}>
                    {price != null ? `${formatTJS(price)} TJS` : '—'}
                  </p>
                  <p className="text-[9px] text-slate-400">
                    {eta != null ? `~${eta} мин` : ''}
                    {cars > 0 ? ` · ${cars} маш.` : ''}
                  </p>
                </div>
              )}
              {compact && (
                <div className="text-center leading-none">
                  {price != null && (
                    <p className={`text-[9px] font-black ${isSurge && price ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                      {formatTJS(price)} TJS
                    </p>
                  )}
                  {eta != null && <p className="text-[8px] text-slate-400">{eta} мин · {cars} маш.</p>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { PASSENGER_TARIFFS as CATEGORIES };
