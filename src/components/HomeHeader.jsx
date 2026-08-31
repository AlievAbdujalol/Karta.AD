import { User, Bus, Heart, Zap, ShieldCheck } from 'lucide-react';
import NotificationPanel from '@/components/NotificationPanel';
import SearchBar from '@/components/SearchBar';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';

const FLAG_MAP = {
  'Таджикистан': '🇹🇯', 'Таджикистон': '🇹🇯', 'Tajikistan': '🇹🇯',
  'Узбекистан': '🇺🇿', 'Uzbekistan': '🇺🇿', 'Ўзбекистон': '🇺🇿',
  'Кыргызстан': '🇰🇬', 'Kyrgyzstan': '🇰🇬', 'Кыргыз Республикасы': '🇰🇬',
  'Казахстан': '🇰🇿', 'Kazakhstan': '🇰🇿', 'Қазақстан': '🇰🇿',
  'Россия': '🇷🇺', 'Russia': '🇷🇺',
};
const getFlag = (c) => FLAG_MAP[c?.trim()] || (c ? '🏳️' : '🌍');

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

  const isAdmin = user?.role === 'admin';
  const isDriver = user?.role === 'driver';

  return (
    <div className="flex flex-col gap-1 w-[calc(100vw-16px)] sm:w-full sm:max-w-[640px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[20px] border border-slate-200/60 dark:border-slate-800/80 shadow-[0_8px_32px_rgba(15,23,42,0.1)] pointer-events-auto">
      {/* Row 1: Logo + Search + Actions */}
      <div className="flex items-center gap-2 px-2.5 py-2 sm:px-3 sm:py-1.5">
        <div onClick={() => navigate('/')} className="flex-shrink-0 cursor-pointer group">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
            <div className="w-full h-full bg-white rounded-[10px] sm:rounded-[11px] flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Karta-AD" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <SearchBar cityId={selectedCity?.id} selectedCity={selectedCity} selectedCountry={selectedCountry} onSelectResult={onSelectResult} mapCenter={mapCenter} />
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <NotificationPanel notifications={notifications || []} onClear={onClearNotifications} />
          <button onClick={() => navigate('/profile')} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 active:scale-95 shadow-sm">
            <User size={14} />
          </button>
        </div>
      </div>

      {/* Row 2: Filters */}
      <div className="flex items-center gap-1.5 px-2.5 pb-2 sm:px-3 sm:pb-2 overflow-x-auto scrollbar-none">
        {isAdmin && (
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-300 text-[8px] font-black uppercase flex-shrink-0">
            <ShieldCheck size={9} /><span>ADMIN</span>
          </div>
        )}
        {isDriver && (
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[8px] font-black uppercase flex-shrink-0">
            <Bus size={9} /><span>DRIVER</span>
          </div>
        )}

        <select value={selectedCountry} onChange={e => { setSelectedCountry(e.target.value); setSelectedCity(null); }}
          className="text-[9px] sm:text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 rounded-full px-2 py-1 border border-slate-200/50 dark:border-slate-700/50 outline-none flex-shrink-0 cursor-pointer">
          <option value="">{t('home.countryFilter')}</option>
          {countries.map(c => <option key={c} value={c}>{getFlag(c)} {c}</option>)}
        </select>

        <select value={selectedCity?.id || ''} onChange={e => { const city = cities.find(c => c.id === e.target.value); setSelectedCity(city || null); }}
          className="text-[9px] sm:text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 rounded-full px-2 py-1 border border-slate-200/50 dark:border-slate-700/50 outline-none flex-shrink-0 cursor-pointer">
          <option value="">{t('home.cityFilter')}</option>
          {filteredCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
          className="text-[9px] sm:text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 rounded-full px-2 py-1 border border-slate-200/50 dark:border-slate-700/50 outline-none flex-shrink-0 cursor-pointer">
          <option value="all">{t('home.allTypes')}</option>
          <option value="bus">{t('home.busType')}</option>
          <option value="minibus">{t('home.minibusType')}</option>
        </select>

        <div className="flex items-center gap-1 rounded-full px-2 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-all duration-200 shadow-sm flex-shrink-0 cursor-pointer active:scale-95 ml-auto">
          <Zap size={10} className="fill-white" />
          <select value={selectedRoute?.id || ''} onChange={e => {
            const route = filteredRoutes.find(r => r.id === e.target.value);
            setSelectedRoute(route || null);
            if (route && logTrip) logTrip(route);
          }} className="text-[9px] sm:text-[10px] font-extrabold text-white bg-transparent outline-none cursor-pointer max-w-[100px] sm:max-w-none">
            <option value="" className="bg-slate-900 text-white">{t('home.routeFilter')}</option>
            {filteredRoutes.map(r => <option key={r.id} value={r.id} className="bg-slate-900 text-white">#{r.number} {r.name || ''}</option>)}
          </select>
          {selectedRoute && (
            <button onClick={e => { e.stopPropagation(); toggleFavorite(selectedRoute); }} className="ml-0.5 p-0.5 hover:scale-110 active:scale-90 transition-transform">
              <Heart size={10} className="text-white" fill={favorites.includes(selectedRoute.id) ? 'white' : 'none'} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
