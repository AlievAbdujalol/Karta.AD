import { User, Globe, Building2, Bus, Heart, Zap, ShieldCheck, ChevronUp, ChevronDown } from 'lucide-react';
import NotificationPanel from '@/components/NotificationPanel';
import SearchBar from '@/components/SearchBar';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';

export default function HomeHeader({
  lang, setLang,
  countries = [], selectedCountry, setSelectedCountry,
  cities = [], filteredCities = [], selectedCity, setSelectedCity,
  selectedType, setSelectedType,
  routes = [], filteredRoutes = [], selectedRoute, setSelectedRoute,
  favorites = [], toggleFavorite,
  logTrip,
  notifications = [], onClearNotifications,
  onSelectResult,
  mapCenter,
}) {
  const navigate = useNavigate();
  const { user } = /** @type {any} */ (useCurrentUser());
  const { t } = useLanguage();
  const [filtersOpen, setFiltersOpen] = useState(() => localStorage.getItem('karta_filters_open') !== 'false');

  const toggleFilters = () => {
    setFiltersOpen(f => {
      const next = !f;
      localStorage.setItem('karta_filters_open', next);
      return next;
    });
  };

  // Role indicators
  const isAdmin = user?.role === 'admin';
  const isDriver = user?.role === 'driver';

  return (
    <div className="w-[calc(100vw-16px)] sm:max-w-[400px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-[0_12px_40px_rgba(15,23,42,0.12)] overflow-visible flex flex-col pointer-events-auto transition-all duration-300">
      {/* Top Main Row */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
        {/* Brand Logo */}
        <div
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
            <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Karta-AD" className="w-5 h-5 object-contain" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 mx-1">
          <SearchBar cityId={selectedCity?.id} onSelectResult={onSelectResult} mapCenter={mapCenter} />
        </div>

        {/* Right Actions Cluster */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Notifications */}
          <NotificationPanel notifications={notifications || []} onClear={onClearNotifications} />

          {/* Profile */}
          <button
            onClick={() => navigate('/profile')}
            className="w-7 h-7 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 active:scale-95 shadow-sm"
          >
            <User size={13} />
          </button>
        </div>
      </div>

      {filtersOpen && (
      <div className="flex items-center gap-1.5 px-4 pb-2.5 overflow-x-auto scrollbar-none">
        {/* Role Pill indicator if Driver or Admin */}
        {isAdmin && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-300 text-[9px] font-black uppercase flex-shrink-0">
            <ShieldCheck size={10} />
            <span>ADMIN</span>
          </div>
        )}
        {isDriver && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[9px] font-black uppercase flex-shrink-0">
            <Bus size={10} />
            <span>DRIVER</span>
          </div>
        )}

        {/* Country filter */}
        <Pill icon={<Globe size={10} className="text-emerald-500" />}>
          <select
            value={selectedCountry}
            onChange={e => { setSelectedCountry(e.target.value); setSelectedCity(null); }}
            className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-transparent outline-none cursor-pointer"
          >
            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('home.countryFilter')}</option>
            {countries.map(c => (
              <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c}</option>
            ))}
          </select>
        </Pill>

        {/* City filter */}
        <Pill icon={<Building2 size={10} className="text-emerald-500" />}>
          <select
            value={selectedCity?.id || ''}
            onChange={e => {
              const city = cities.find(c => c.id === e.target.value);
              setSelectedCity(city || null);
            }}
            className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-transparent outline-none cursor-pointer"
          >
            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('home.cityFilter')}</option>
            {filteredCities.map(c => (
              <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{c.name}</option>
            ))}
          </select>
        </Pill>

        {/* Vehicle type filter */}
        <Pill icon={<Bus size={10} className="text-emerald-500" />}>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-transparent outline-none cursor-pointer"
          >
            <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('home.allTypes')}</option>
            <option value="bus" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('home.busType')}</option>
            <option value="minibus" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('home.minibusType')}</option>
          </select>
        </Pill>

        {/* Active Route selector */}
        <div className="ml-auto flex-shrink-0">
          <div className="flex items-center gap-1 rounded-full px-2.5 py-0.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-all duration-200 shadow-sm active:scale-95">
            <Zap size={10} className="fill-white" />
            <select
              value={selectedRoute?.id || ''}
              onChange={e => {
                const route = filteredRoutes.find(r => r.id === e.target.value);
                setSelectedRoute(route || null);
                if (route && logTrip) logTrip(route);
              }}
              className="text-[10px] font-extrabold text-white bg-transparent outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-white">{t('home.routeFilter')}</option>
              {filteredRoutes.map(r => (
                <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                  #{r.number} {r.name || ''}
                </option>
              ))}
            </select>
            {selectedRoute && (
              <button
                onClick={e => { e.stopPropagation(); toggleFavorite(selectedRoute); }}
                className="ml-0.5 p-0.5 hover:scale-110 active:scale-90 transition-transform"
              >
                <Heart size={10} className="text-white" fill={favorites.includes(selectedRoute.id) ? 'white' : 'none'} />
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      <button onClick={toggleFilters} className="flex items-center justify-center w-full pb-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
        {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
    </div>
  );
}

function Pill({ icon, children }) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 rounded-full px-3 py-1 flex-shrink-0 border border-slate-200/50 dark:border-slate-700/50 transition-all duration-200">
      {icon}
      {children}
    </div>
  );
}