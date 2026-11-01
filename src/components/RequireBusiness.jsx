/**
 * RequireBusiness — гейт раздела /business.
 *
 * Требование: пользователь без активной роли «Бизнес» не должен видеть
 * бизнес-раздел и его данные. Компонент монтируется ВОКРУГ страниц, поэтому
 * при отказе страница не рендерится и не делает ни одного запроса к бизнес-
 * таблицам — данные не утекают даже случайно.
 *
 * Админ проходит всегда (поддержка/модерация). Сотрудникам бизнеса
 * (manager/employee) доступ по-прежнему выдаёт владелец через членство —
 * подписка проверяется у аккаунта, открывшего раздел.
 */
import { useNavigate, Outlet } from 'react-router-dom';
import { Lock, Check, ArrowRight, MapPin } from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { businessAccessState, canAccessBusiness, BUSINESS_ACCESS } from '@/lib/businessAccess';
import { BUSINESS_MONTHLY_FEE } from '@/lib/roles';

const FEATURES = [
  'Товары и категории',
  'Заказы и доставка',
  'Аналитика продаж',
  'AI-сайт и виджет для своего сайта',
];

function LoadingSpinner() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
    </div>
  );
}

/**
 * Пейволл: объясняет цену и ведёт туда, где роль действительно активируется.
 * Кнопка ничего не «покупает» сама — оплата только в профиле.
 */
function BusinessPaywall({ state }) {
  const navigate = useNavigate();
  const expired = state === BUSINESS_ACCESS.expired;

  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600">
          <Lock size={26} className="text-white" />
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {expired ? 'Подписка «Бизнес» истекла' : 'Нужна роль «Бизнес»'}
          </h1>
          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {BUSINESS_MONTHLY_FEE} TJS / месяц
          </p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {expired
              ? 'Продлите подписку в профиле — раздел и данные бизнеса снова откроются.'
              : 'Роль открывает бизнес-раздел: товары, заказы, доставку, аналитику, AI-сайт и виджет.'}
          </p>
        </div>

        <ul className="space-y-2 text-left">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.99]"
          >
            {expired ? 'Продлить в профиле' : 'Активировать в профиле'}
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <MapPin size={15} />
            На карту
          </button>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Оплата и смена роли — только в профиле.
        </p>
      </div>
    </div>
  );
}

export default function RequireBusiness({ children }) {
  const { user, loading } = useCurrentUser();

  if (loading) return <LoadingSpinner />;
  if (!canAccessBusiness(user)) return <BusinessPaywall state={businessAccessState(user)} />;

  return children ?? <Outlet />;
}
