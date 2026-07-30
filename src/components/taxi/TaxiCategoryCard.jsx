import { Car, Ban, Sparkles, Truck, Wind } from 'lucide-react';

const CATEGORIES = [
  { id: 'economy', icon: Car, label: 'Эконом', price: 'от 7 TJS', color: 'bg-amber-500', desc: '1-4 чел.' },
  { id: 'comfort', icon: Sparkles, label: 'Комфорт', price: 'от 10 TJS', color: 'bg-blue-500', desc: '1-4 чел.' },
  { id: 'comfort_plus', icon: Wind, label: 'Комфорт+', price: 'от 15 TJS', color: 'bg-indigo-500', desc: '1-4 чел.' },
  { id: 'minivan', icon: Truck, label: 'Минивэн', price: 'от 18 TJS', color: 'bg-orange-500', desc: 'до 7 чел.' },
  { id: 'business', icon: Sparkles, label: 'Бизнес', price: 'от 25 TJS', color: 'bg-slate-800', desc: '1-3 чел.' },
  { id: 'women', icon: Ban, label: 'Для женщин', price: 'от 8 TJS', color: 'bg-pink-500', desc: 'Женщина-водитель' },
];

export default function TaxiCategoryCard({ selected, onSelect, priceInfo, compact }) {
  const selectedCat = CATEGORIES.find(c => c.id === selected) || CATEGORIES[0];

  return (
    <div className={`overflow-x-auto scrollbar-hide ${compact ? '-mx-4 px-4' : ''}`}>
      <div className={`flex gap-2 ${compact ? '' : 'flex-col'}`}>
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = selected === cat.id;
          const estPrice = priceInfo?.[cat.id];
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`flex-shrink-0 transition-all duration-200 ${
                compact
                  ? `flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 min-w-[72px] ${
                      isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`
                  : `flex items-center gap-3 p-3 rounded-xl border-2 w-full ${
                      isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`
              }`}
            >
              <div className={`w-8 h-8 rounded-full ${cat.color} flex items-center justify-center`}>
                <Icon size={compact ? 14 : 16} className="text-white" />
              </div>
              <div className={compact ? 'text-center' : 'flex-1'}>
                <p className={`font-bold ${compact ? 'text-[10px]' : 'text-xs'}`}>{cat.label}</p>
                {!compact && <p className="text-[10px] text-slate-400">{cat.desc}</p>}
              </div>
              {!compact && (
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {estPrice ? `${estPrice} TJS` : cat.price}
                  </p>
                  <p className="text-[9px] text-slate-400">~{cat.desc.split(' ')[0]} мин</p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { CATEGORIES };
