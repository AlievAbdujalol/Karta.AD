import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Шапка подразделов бизнеса: назад в меню + заголовок + действие справа.
 */
export default function BusinessSubHeader({ title, icon: Icon, iconClassName = '', right = null }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigate('/business')}
        title="Назад в меню бизнеса"
        className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 shrink-0"
      >
        <ArrowLeft size={17} />
      </button>
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 min-w-0 flex-1">
        {Icon && <span className={iconClassName}><Icon size={22} /></span>}
        <span className="truncate">{title}</span>
      </h1>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
