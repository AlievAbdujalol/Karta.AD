import { Search, Mic, User, Globe, Building2, Bus, Clock, Heart, Zap, X } from 'lucide-react';
import NotificationPanel from '@/components/NotificationPanel';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomeHeader({
  lang, setLang,
  countries, selectedCountry, setSelectedCountry,
  cities, filteredCities, selectedCity, setSelectedCity,
  selectedType, setSelectedType,
  routes, filteredRoutes, selectedRoute, setSelectedRoute,
  favorites, toggleFavorite,
  logTrip,
  notifications, onClearNotifications,
}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  // Search results: cities + routes
  const q = searchQuery.trim().toLowerCase();
  const cityResults = q.length > 0
    ? cities.filter(c => c.name?.toLowerCase().includes(q) || c.country?.toLowerCase().includes(q)).slice(0, 3)
    : [];
  const routeResults = q.length > 0
    ? routes.filter(r => r.number?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const hasResults = cityResults.length > 0 || routeResults.length > 0;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectCity = (city) => {
    setSelectedCity(city);
    setSelectedCountry(city.country || '');
    setSearchQuery(city.name);
    setSearchOpen(false);
  };

  const handleSelectRoute = (route) => {
    setSelectedRoute(route);
    logTrip(route);
    setSearchQuery(`#${route.number} ${route.name || ''}`);
    setSearchOpen(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchOpen(false);
  };
  return (
    <div className="w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-[24px] border border-slate-200/50 dark:border-slate-800/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] overflow-visible flex flex-col pointer-events-auto transition-all duration-300">
      {/* Top row */}
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="rounded-xl overflow-hidden flex-shrink-0 shadow-sm border border-slate-100 dark:border-slate-800" style={{ padding: 3, width: 36, height: 36 }}>
            <img src="/logo.png" alt="Karta-AD" style={{ width: 28, height: 28, objectFit: 'contain', display: 'block' }} />
          </div>
          <div className="leading-tight hidden sm:block select-none">
            <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '-0.3px' }} className="text-slate-800 dark:text-white">Karta-</span>
            <span style={{ fontWeight: 800, fontSize: 13, color: '#10B981', letterSpacing: '-0.3px' }}>AD</span>
            <div style={{ fontSize: 8, fontWeight: 600, marginTop: 0.5 }} className="text-slate-400 dark:text-slate-500">Транспорт</div>
          </div>
        </div>
 
        {/* Search */}
        <div className="flex-1 relative" ref={searchRef}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/60 transition-all focus-within:border-blue-500/50">
            <Search size={13} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Поиск города или маршрута..."
              className="flex-1 text-xs text-slate-850 dark:text-slate-100 bg-transparent outline-none placeholder-slate-400 dark:placeholder-slate-500 min-w-0"
            />
            {searchQuery
              ? <button onClick={clearSearch} className="active:scale-90 transition-transform"><X size={13} className="text-slate-400 dark:text-slate-500" /></button>
              : <Mic size={13} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
            }
          </div>
 
          {/* Dropdown results */}
          {searchOpen && hasResults && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: 'white', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 99999, overflow: 'hidden' }}
              className="dark:bg-slate-900 border dark:border-slate-800">
              {cityResults.length > 0 && (
                <>
                  <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Города</div>
                  {cityResults.map(c => (
                    <button key={c.id} onMouseDown={() => handleSelectCity(c)} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f1f5f9' }}
                      className="hover:bg-blue-50 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                      <span style={{ fontSize: 18 }}>🏙️</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }} className="text-slate-800 dark:text-slate-100">{c.name}</div>
                        <div style={{ fontSize: 11 }} className="text-slate-400 dark:text-slate-500">{c.country}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {routeResults.length > 0 && (
                <>
                  <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Маршруты</div>
                  {routeResults.map(r => (
                    <button key={r.id} onMouseDown={() => handleSelectRoute(r)} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f1f5f9' }}
                      className="hover:bg-blue-50 dark:hover:bg-slate-800/50 dark:border-slate-800 transition-colors">
                      <span style={{ background: r.color || '#1565C0', color: 'white', borderRadius: 8, padding: '2px 8px', fontWeight: 800, fontSize: 12 }}>#{r.number}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }} className="text-slate-850 dark:text-slate-100">{r.name || `Маршрут ${r.number}`}</div>
                        <div style={{ fontSize: 11 }} className="text-slate-400 dark:text-slate-500">{r.type === 'minibus' ? 'Маршрутка' : 'Автобус'}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
 
        {/* Right icons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Lang */}
          <div className="flex items-center gap-1 cursor-pointer rounded-xl px-2 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
            <span className="text-xs">🇹🇯</span>
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              className="text-[10px] font-bold text-slate-800 dark:text-slate-100 bg-transparent outline-none appearance-none cursor-pointer"
              style={{ minWidth: '22px' }}
            >
              <option value="ru" className="text-black bg-white dark:bg-slate-900 dark:text-white">RU</option>
              <option value="tg" className="text-black bg-white dark:bg-slate-900 dark:text-white">TG</option>
              <option value="en" className="text-black bg-white dark:bg-slate-900 dark:text-white">EN</option>
            </select>
          </div>
 
          {/* Notifications */}
          <NotificationPanel notifications={notifications || []} onClear={onClearNotifications} />
 
          {/* Profile */}
          <button onClick={() => navigate('/profile')} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850">
            <User size={13} />
          </button>
        </div>
      </div>
 
      {/* Filter pills */}
      <div className="flex gap-2 px-3.5 pb-3.5 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {/* Country */}
        <Pill icon={<Globe size={11} className="text-blue-500" />}>
          <select
            value={selectedCountry}
            onChange={e => { setSelectedCountry(e.target.value); setSelectedCity(null); }}
            className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-transparent outline-none appearance-none cursor-pointer"
            style={{ minWidth: '54px' }}
          >
            <option value="" className="text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-900">Страна</option>
            {countries.map(c => <option key={c} value={c} className="text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-900">{c}</option>)}
          </select>
        </Pill>
 
        {/* City */}
        <Pill icon={<Building2 size={11} className="text-blue-500" />}>
          <select
            value={selectedCity?.id || ''}
            onChange={e => { const city = cities.find(c => c.id === e.target.value); setSelectedCity(city || null); }}
            className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-transparent outline-none appearance-none cursor-pointer"
            style={{ minWidth: '50px' }}
          >
            <option value="" className="text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-900">Город</option>
            {filteredCities.map(c => <option key={c.id} value={c.id} className="text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-900">{c.name}</option>)}
          </select>
        </Pill>
 
        {/* Type */}
        <Pill icon={<Bus size={11} className="text-blue-500" />}>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-transparent outline-none appearance-none cursor-pointer"
            style={{ minWidth: '70px' }}
          >
            <option value="all" className="text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-900">Все виды</option>
            <option value="bus" className="text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-900">Автобус</option>
            <option value="minibus" className="text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-900">Маршрутка</option>
          </select>
        </Pill>
 
        {/* Now */}
        <Pill icon={<Clock size={11} className="text-blue-500" />}>
          <span className="text-[10px] font-bold text-slate-750 dark:text-slate-200">Сейчас</span>
        </Pill>
 
        {/* Route */}
        <div className="ml-auto flex-shrink-0">
          <div className="flex items-center gap-1 rounded-full px-3 py-1.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 transition-all duration-200 shadow-sm active:scale-95">
            <Zap size={11} className="text-white opacity-95" />
            <select
              value={selectedRoute?.id || ''}
              onChange={e => {
                const route = filteredRoutes.find(r => r.id === e.target.value);
                setSelectedRoute(route || null);
                if (route) logTrip(route);
              }}
              className="text-[10px] font-extrabold text-white bg-transparent outline-none appearance-none cursor-pointer"
              style={{ minWidth: '60px' }}
            >
              <option value="" className="text-gray-900 bg-white">Маршрут</option>
              {filteredRoutes.map(r => <option key={r.id} value={r.id} className="text-gray-900 bg-white">#{r.number} {r.name || ''}</option>)}
            </select>
            {selectedRoute && (
              <button onClick={e => { e.stopPropagation(); toggleFavorite(selectedRoute); }} className="ml-1 active:scale-90 transition-transform">
                <Heart size={11} className="text-white" fill={favorites.includes(selectedRoute.id) ? 'white' : 'none'} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
 
function Pill({ icon, children }) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-750/80 rounded-full px-3 py-1.5 flex-shrink-0 border border-slate-100 dark:border-slate-800/50 shadow-sm transition-all duration-200">
      {icon}
      {children}
    </div>
  );
}