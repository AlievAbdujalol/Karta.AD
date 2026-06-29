import { Link, useLocation, Outlet } from 'react-router-dom';
import { Map, Heart, User, Bus, CalendarDays, ShieldCheck } from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function Layout() {
  const { user } = useCurrentUser();
  const location = useLocation();
  const isDriver = user?.role === 'driver';
  const isAdmin = user?.role === 'admin';

  const navLinks = [
    { to: '/', icon: Map, label: 'Карта' },
    { to: '/?tab=transport', icon: Bus, label: 'Транспорт' },
    ...(isDriver ? [
      { to: '/driver', icon: Bus, label: 'Мой рейс' },
      { to: '/driver-schedule', icon: CalendarDays, label: 'График' },
    ] : []),
    ...(isAdmin ? [
      { to: '/admin', icon: ShieldCheck, label: 'Админ' },
    ] : []),
    { to: '/reviews', icon: Heart, label: 'Избранное' },
    { to: '/profile', icon: User, label: 'Профиль' },
  ];

  return (
    <div className="flex flex-col bg-slate-50 dark:bg-gray-950" style={{ height: '100dvh' }}>
      <main className="flex-1 relative overflow-hidden" style={{ minHeight: 0, width: '100%' }}>
        <Outlet />
      </main>

      <nav
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-slate-100 dark:border-slate-800/60 flex justify-around items-center flex-shrink-0 z-50 transition-all duration-300"
        style={{
          boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.03)',
          paddingBottom: 'env(safe-area-inset-bottom, 8px)',
          paddingTop: '8px',
          minHeight: 64,
        }}
      >
        {navLinks.map(({ to, icon: Icon, label }) => {
          const active = to === '/'
            ? location.pathname === '/' && !location.search.includes('tab=transport')
            : to.includes('tab=transport')
              ? location.pathname === '/' && location.search.includes('tab=transport')
              : location.pathname === to;
          
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 relative active:scale-95 group"
            >
              <Icon
                size={20}
                className={`transition-all duration-300 ${
                  active
                    ? 'text-blue-600 dark:text-blue-400 scale-110'
                    : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400'
                }`}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span
                className={`text-[10px] font-semibold tracking-wide transition-all duration-300 ${
                  active
                    ? 'text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400'
                }`}
              >
                {label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}