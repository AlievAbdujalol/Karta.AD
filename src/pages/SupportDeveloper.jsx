import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, RefreshCw, ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { isSupportDeveloper } from '@/lib/supportApi';
import DeveloperTab from '@/components/support/DeveloperTab';

/**
 * /support/developer — отдельная точка входа в панель разработчика
 * (на неё ведут уведомления). Доступ определяется ТОЛЬКО таблицей
 * support_developers: никаких скрытых кнопок, почт, имён и значений
 * профиля здесь не проверяется — RLS в любом случае не пустит чужих.
 */
export default function SupportDeveloper() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [state, setState] = useState('checking'); // checking | allowed | denied

  useEffect(() => {
    let alive = true;
    if (!user?.id) {
      setState('denied');
      return () => {};
    }
    isSupportDeveloper(user.id)
      .then(v => alive && setState(v ? 'allowed' : 'denied'))
      .catch(() => alive && setState('denied'));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-8">
        <Link
          to="/reviews"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft size={14} />
          {t('support.back')}
        </Link>

        {state === 'checking' && (
          <div className="text-center py-16 text-slate-400">
            <RefreshCw size={28} className="mx-auto animate-spin opacity-40" />
          </div>
        )}

        {state === 'allowed' && <DeveloperTab userId={user?.id} />}

        {state === 'denied' && (
          <div className="bg-white dark:bg-slate-900 rounded-[20px] p-8 shadow-sm border border-slate-100 dark:border-slate-800/50 text-center space-y-3">
            <ShieldAlert size={40} className="mx-auto text-slate-300" />
            <p className="text-sm font-black text-slate-700 dark:text-slate-200">
              {t('support.noAccess')}
            </p>
            <p className="text-xs text-slate-400">{t('support.noAccessHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
