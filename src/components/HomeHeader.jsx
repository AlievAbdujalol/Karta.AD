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
    <div className="flex-shrink-0 z-30" style={{ background: 'linear-gradient(160deg, #0f2660 0%, #1a3f8f 50%, #1e56d0 100%)' }}>
      {/* Top row */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2.5">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'white', padding: 3, width: 40, height: 40 }}>
            <img src="/logo.png" alt="Karta-AD" style={{ width: 34, height: 34, objectFit: 'contain', display: 'block' }} />
          </div>
          <div className="leading-tight hidden sm:block select-none">
            <span style={{ fontWeight: 800, fontSize: 15, color: 'white', letterSpacing: '-0.3px' }}>Karta-</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#4ade80', letterSpacing: '-0.3px' }}>AD</span>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 500, marginTop: 1 }}>Транспорт Таджикистана</div>
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 relative" ref={searchRef}>
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Search size={14} className="text-blue-200 flex-shrink-0" />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Поиск города или маршрута..."
              className="flex-1 text-sm text-white bg-transparent outline-none placeholder-blue-300 min-w-0"
            />
            {searchQuery
              ? <button onClick={clearSearch}><X size={14} className="text-blue-200" /></button>
              : <Mic size={14} className="text-blue-200 flex-shrink-0" />
            }
          </div>

          {/* Dropdown results */}
          {searchOpen && hasResults && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: 'white', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 99999, overflow: 'hidden' }}>
              {cityResults.length > 0 && (
                <>
                  <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Города</div>
                  {cityResults.map(c => (
                    <button key={c.id} onMouseDown={() => handleSelectCity(c)} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f1f5f9' }}
                      className="hover:bg-blue-50 transition-colors">
                      <span style={{ fontSize: 18 }}>🏙️</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.country}</div>
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
                      className="hover:bg-blue-50 transition-colors">
                      <span style={{ background: r.color || '#1565C0', color: 'white', borderRadius: 8, padding: '2px 8px', fontWeight: 800, fontSize: 12 }}>#{r.number}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{r.name || `Маршрут ${r.number}`}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.type === 'minibus' ? 'Маршрутка' : 'Автобус'}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Lang */}
          <div className="flex items-center gap-1 cursor-pointer rounded-xl px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <span className="text-xs">🇹🇯</span>
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              className="text-xs font-bold text-white bg-transparent outline-none appearance-none cursor-pointer"
              style={{ minWidth: '26px' }}
            >
              <option value="ru" className="text-black">RU</option>
              <option value="tg" className="text-black">TG</option>
              <option value="en" className="text-black">EN</option>
            </select>
          </div>

          {/* Notifications */}
          <NotificationPanel notifications={notifications || []} onClear={onClearNotifications} />

          {/* Profile */}
          <button onClick={() => navigate('/profile')} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors hover:bg-white/25" style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <User size={16} className="text-white" />
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 px-4 pb-3.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Country */}
        <Pill icon={<Globe size={12} className="text-blue-400" />}>
          <select
            value={selectedCountry}
            onChange={e => { setSelectedCountry(e.target.value); setSelectedCity(null); }}
            className="text-xs font-semibold text-gray-700 bg-transparent outline-none appearance-none cursor-pointer"
            style={{ minWidth: '64px' }}
          >
            <option value="">Страна</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Pill>

        {/* City */}
        <Pill icon={<Building2 size={12} className="text-blue-400" />}>
          <select
            value={selectedCity?.id || ''}
            onChange={e => { const city = cities.find(c => c.id === e.target.value); setSelectedCity(city || null); }}
            className="text-xs font-semibold text-gray-700 bg-transparent outline-none appearance-none cursor-pointer"
            style={{ minWidth: '60px' }}
          >
            <option value="">Город</option>
            {filteredCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Pill>

        {/* Type */}
        <Pill icon={<Bus size={12} className="text-blue-400" />}>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="text-xs font-semibold text-gray-700 bg-transparent outline-none appearance-none cursor-pointer"
            style={{ minWidth: '90px' }}
          >
            <option value="all">Все виды</option>
            <option value="bus">Автобус</option>
            <option value="minibus">Маршрутка</option>
          </select>
        </Pill>

        {/* Now */}
        <Pill icon={<Clock size={12} className="text-blue-400" />}>
          <span className="text-xs font-semibold text-gray-700">Сейчас</span>
        </Pill>

        {/* Route */}
        <div className="ml-auto flex-shrink-0">
          <div className="flex items-center gap-1.5 rounded-2xl px-3.5 py-2" style={{ background: 'linear-gradient(135deg, #1565c0, #1e88e5)', boxShadow: '0 4px 14px rgba(30,86,208,0.4)' }}>
            <Zap size={12} className="text-white opacity-80" />
            <select
              value={selectedRoute?.id || ''}
              onChange={e => {
                const route = filteredRoutes.find(r => r.id === e.target.value);
                setSelectedRoute(route || null);
                if (route) logTrip(route);
              }}
              className="text-xs font-bold text-white bg-transparent outline-none appearance-none cursor-pointer"
              style={{ minWidth: '80px' }}
            >
              <option value="" className="text-black">Маршрут</option>
              {filteredRoutes.map(r => <option key={r.id} value={r.id} className="text-black">#{r.number} {r.name || ''}</option>)}
            </select>
            {selectedRoute && (
              <button onClick={e => { e.stopPropagation(); toggleFavorite(selectedRoute); }}>
                <Heart size={12} className="text-white" fill={favorites.includes(selectedRoute.id) ? 'white' : 'none'} />
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
    <div className="flex items-center gap-1.5 bg-white rounded-2xl px-3 py-2 flex-shrink-0" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)' }}>
      {icon}
      {children}
    </div>
  );
}