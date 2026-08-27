import { PASSENGER_TARIFFS, formatTJS } from '@/lib/taxi';

export default function TaxiCategoryCard({ selected, onSelect, priceInfo, compact, demandCoef }) {
  const isSurge = (Number(demandCoef) || 1) > 1;

  return (
    <div className={`scrollbar-hide overflow-x-auto ${compact ? '-mx-1' : ''}`}>
      <div className={compact ? 'flex gap-2' : 'flex flex-col gap-2'}>
        {PASSENGER_TARIFFS.map((cat) => {
          const Icon = cat.icon;
          const isActive = selected === cat.id;
          const info = priceInfo?.[cat.id] || {};
          const price = info.price ?? null;
          const eta = info.eta ?? null;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              className={`shrink-0 transition-all ${
                compact
                  ? `flex min-w-[72px] flex-col items-center gap-1 rounded-2xl border px-2 py-2 ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
                    }`
                  : `flex w-full items-center gap-3 rounded-2xl border p-3 ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15'
                        : 'border-slate-200 dark:border-slate-700'
                    }`
              }`}
            >
              <div className={`flex items-center justify-center rounded-full bg-gradient-to-br ${cat.gradient} ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
                <Icon size={compact ? 14 : 16} className="text-white" />
              </div>
              <p className={`font-semibold ${compact ? 'text-[10px] leading-none' : 'text-xs'}`}>{cat.short}</p>
              {compact && price != null && (
                <p className={`text-[10px] font-bold leading-none ${isSurge ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>
                  {formatTJS(price)}
                </p>
              )}
              {compact && eta != null && <p className="text-[9px] leading-none text-slate-400">{eta} мин</p>}
              {!compact && (
                <div className="ml-auto text-right">
                  <p className={`text-sm font-bold ${isSurge && price ? 'text-red-500' : ''}`}>
                    {price != null ? `${formatTJS(price)} TJS` : '—'}
                  </p>
                  {eta != null && <p className="text-[10px] text-slate-400">~{eta} мин</p>}
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
