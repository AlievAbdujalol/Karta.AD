import { useEffect, useState } from 'react';
import { Star, Users, LifeBuoy, Wrench } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { isSupportDeveloper } from '@/lib/supportApi';
import TripReviewsTab from '@/components/support/TripReviewsTab';
import CommunityTab from '@/components/support/CommunityTab';
import SupportTab from '@/components/support/SupportTab';
import DeveloperTab from '@/components/support/DeveloperTab';

/**
 * «Отзывы и поддержка» — три направления:
 *  - Сообщество: публичные посты (community_*),
 *  - Обращения: личные тикеты в поддержку (support_*),
 *  - Оценить поездку: прежняя форма отзывов о поездке (reviews) — без изменений.
 * Плюс вкладка «Разработчикам» (панель), видимая только участникам
 * support_developers — по роли из профиля НЕ определяется.
 */
export default function Reviews() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [tab, setTab] = useState('community');
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    let alive = true;
    isSupportDeveloper(user?.id)
      .then(v => alive && setIsDev(v))
      .catch(() => alive && setIsDev(false));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const tabs = [
    { id: 'community', label: t('reviews.tabCommunity'), icon: Users },
    { id: 'support', label: t('reviews.tabSupport'), icon: LifeBuoy },
    { id: 'trip', label: t('reviews.tabTrip'), icon: Star },
    ...(isDev ? [{ id: 'dev', label: t('reviews.tabDeveloper'), icon: Wrench }] : []),
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-8">
        <div className="bg-gradient-to-br from-blue-600 to-sky-500 rounded-[20px] p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
            <Star size={160} fill="white" />
          </div>
          <h1 className="text-xl font-black tracking-tight">{t('reviews.pageTitle')}</h1>
          <p className="text-blue-100 text-xs mt-1 font-medium">{t('reviews.pageSubtitle')}</p>
        </div>

        <div
          role="tablist"
          aria-label={t('reviews.pageTitle')}
          className="flex bg-slate-100 dark:bg-slate-900 rounded-xl p-1 shadow-sm border border-slate-200/50 dark:border-slate-800/60"
        >
          {tabs.map(tab_ => {
            const Icon = tab_.icon;
            return (
              <button
                key={tab_.id}
                type="button"
                role="tab"
                aria-selected={tab === tab_.id}
                id={`reviews-tab-${tab_.id}`}
                aria-controls="reviews-tabpanel"
                onClick={() => setTab(tab_.id)}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
                  tab === tab_.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon size={12} />
                <span className="truncate">{tab_.label}</span>
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="reviews-tabpanel" aria-labelledby={`reviews-tab-${tab}`}>
          {tab === 'community' && <CommunityTab userId={user?.id} />}
          {tab === 'support' && <SupportTab userId={user?.id} />}
          {tab === 'trip' && <TripReviewsTab />}
          {tab === 'dev' && isDev && <DeveloperTab userId={user?.id} />}
        </div>
      </div>
    </div>
  );
}
