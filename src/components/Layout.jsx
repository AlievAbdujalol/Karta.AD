import { useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { Map, User, Bus, CalendarDays, ShieldCheck, Square, MessageSquare, Car } from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useTrip } from '@/lib/TripContext';
import { useLanguage, LANG_KEY } from '@/lib/useLanguage';
import { useTaxiIncoming } from '@/hooks/useTaxiIncoming';

export default function Layout() {
  const { user } = /** @type {any} */ (useCurrentUser());
  const location = useLocation();
  const isDriver = user?.role === 'driver';
  const isAdmin = user?.role === 'admin';
  const { isTracking, gpsInfo, activeRoute, endTrip } = useTrip();
  const { t, setLang } = useLanguage();
  useTaxiIncoming(user);

  useEffect(() => {
    if (user?.language && !localStorage.getItem(LANG_KEY)) {
      setLang(user.language);
    }
  }, [user?.id]);

  const navLinks = [
    { to: '/', icon: Map, label: t('nav.map') },
    ...(isDriver ? [
      { to: '/driver', icon: Bus, label: t('nav.myTrip') },
      { to: '/driver-schedule', icon: CalendarDays, label: t('nav.schedule') },
    ] : []),
    ...(isAdmin ? [
      { to: '/admin', icon: ShieldCheck, label: t('nav.admin') },
    ] : []),
    { to: user?.role === 'taxi_driver' ? '/taxi/driver' : '/taxi', icon: Car, label: 'Такси' },
    { to: '/reviews', icon: MessageSquare, label: t('nav.reviews') },
    { to: '/profile', icon: User, label: t('nav.profile') },
  ];

  return (
    <div className="flex flex-col bg-slate-50 dark:bg-slate-950 w-full h-[100dvh] overflow-hidden select-none">
      {isTracking && (
        <div className="z-[3000] bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 flex items-center justify-between flex-shrink-0 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2 h-2 bg-white rounded-full animate-ping shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-black uppercase tracking-wider">{t('nav.tripActiveBanner')}</span>
              <p className="text-[11px] opacity-80 truncate">
                {activeRoute ? `#${activeRoute.number} ${activeRoute.name || ''}` : t('nav.routeLabel')} · {gpsInfo.speed} {t('speedUnit')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/driver" className="text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100">
              {t('nav.open')}
            </Link>
            <button
              onClick={endTrip}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
            >
              <Square size={12} />
              {t('nav.endTrip')}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Stage */}
      <main className="flex-1 relative w-full h-full min-h-0 overflow-hidden">
        <Outlet />
      </main>

      {/* Floating Bottom Navigation Bar for Mobile & Desktop */}
      <nav
        className="z-[2000] w-full flex items-center justify-around px-2 py-1.5 flex-shrink-0 bg-white dark:bg-slate-950 border-t border-slate-200/60 dark:border-slate-800/80"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 8px)',
          minHeight: '64px',
        }}
      >
        {navLinks.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to;

          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl transition-all duration-300 relative group active:scale-95 min-w-0 ${
                active ? 'bg-blue-50/80 dark:bg-blue-500/15' : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  size={18}
                  className={`transition-all duration-300 ${
                    active
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                  }`}
                  strokeWidth={active ? 2.4 : 1.8}
                />
              </div>

              <span
                className={`text-[10px] leading-none font-medium transition-colors duration-300 ${
                  active
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                }`}
              >
                {label}
              </span>

              {active && (
                <span className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 shadow-sm shadow-blue-500/50" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
