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
    <div className="flex flex-col bg-white" style={{ height: '100dvh' }}>
      <main className="flex-1 overflow-hidden" style={{ minHeight: 0, width: '100%' }}>
        <Outlet />
      </main>

      <nav
        className="bg-white flex justify-around items-center flex-shrink-0 z-50"
        style={{ boxShadow: '0 -1px 0 #e5e7eb, 0 -4px 16px rgba(0,0,0,0.06)', paddingBottom: 'env(safe-area-inset-bottom, 8px)', paddingTop: '8px', minHeight: 60 }}
      >
        {navLinks.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-0.5 px-3 py-1 transition-all"
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 1.7} color={active ? '#1e56d0' : '#9ca3af'} />
              <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? '#1e56d0' : '#9ca3af' }}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}