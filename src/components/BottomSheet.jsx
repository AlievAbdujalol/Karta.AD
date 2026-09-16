import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapPin, Bus, Heart, History, ChevronLeft, ChevronRight, User, GripHorizontal,
  Search, ArrowUpRight, Eye, EyeOff, Star, Clock3, Filter, Inbox, SearchX, Navigation,
  X,
} from 'lucide-react';
import { TripLog } from '@/api/entities';
import { supabase } from '@/api/supabase';
import { useLanguage } from '@/lib/useLanguage';

const STOPS_PAGE_SIZE = 15;
const SORT_OPTIONS = [
  { id: 'distance', label: 'По близости', icon: Navigation },
  { id: 'routes', label: 'По маршрутам', icon: Bus },
  { id: 'name', label: 'По названию', icon: Filter },
];

export default function BottomSheet({
  selectedCity, routes = [], vehicles = [], favorites = [], toggleFavorite,
  selectedRoute, setSelectedRoute, mapCenter, currentUser, watchedStop, setWatchedStop,
  sheetState, setSheetState, activeTab, setActiveTab, onSelectFavDriver, onFlyTo,
  userPosition,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stopSearch, setStopSearch] = useState('');
  const [routeTypeFilter, setRouteTypeFilter] = useState('all');
  const [favSubTab, setFavSubTab] = useState('routes');
  const [visibleStopsCount, setVisibleStopsCount] = useState(STOPS_PAGE_SIZE);
  const [favDrivers, setFavDrivers] = useState([]);
  const [stopSort, setStopSort] = useState('distance');
  const [selectedStopDetail, setSelectedStopDetail] = useState(null);
  const { t } = useLanguage();
  const touchStartY = useRef(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (!currentUser?.id) { setFavDrivers([]); return; }
    supabase.from('favorite_drivers').select('*').eq('user_id', currentUser.id)
      .then(({ data }) => setFavDrivers(data || [])).catch(() => {});
  }, [currentUser?.id]);

  const [tripHistory, setTripHistory] = useState([]);
  useEffect(() => {
    if (!currentUser?.id) { setTripHistory([]); return; }
    const loadHistory = async () => {
      try {
        const logs = await TripLog.filter({ user_id: currentUser.id }, '-created_at');
        const { data: txRows } = await supabase
          .from('transactions').select('*')
          .eq('sender_id', currentUser.id).eq('status', 'completed')
          .order('created_at', { ascending: false });
        const txTrips = (txRows || []).map((tx) => ({
          id: tx.id, route_id: null, route_number: '—',
          route_name: tx.recipient_id ? 'Оплата водителю' : 'Пополнение баланса',
          city_name: '', route_color: '#10b981', route_type: 'payment',
          created_at: tx.created_at, amount: tx.amount, isPayment: true,
        }));
        const seen = new Set();
        const all = [...logs, ...txTrips]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
        setTripHistory(all.slice(0, 30));
      } catch { setTripHistory([]); }
    };
    loadHistory();
  }, [currentUser?.id, selectedRoute]);

  useEffect(() => { setVisibleStopsCount(STOPS_PAGE_SIZE); }, [stopSearch, selectedCity?.id, routes.length, stopSort]);

  const uniqueStops = useMemo(() => {
    if (!routes.length) return [];
    const map = new Map();
    routes.forEach((route) => {
      (route.stops || []).forEach((stop) => {
        if (!stop.lat || !stop.lng) return;
        const key = `${stop.lat.toFixed(5)}-${stop.lng.toFixed(5)}`;
        if (!map.has(key)) {
          map.set(key, { ...stop, passingRoutes: [route], id: key });
        } else {
          const ex = map.get(key);
          if (!ex.passingRoutes.find((r) => r.id === route.id)) ex.passingRoutes.push(route);
        }
      });
    });
    const refLat = userPosition?.[0] || mapCenter?.[0] || 0;
    const refLng = userPosition?.[1] || mapCenter?.[1] || 0;
    return Array.from(map.values())
      .map((stop) => ({
        ...stop,
        distance: haversineApprox(refLat, refLng, stop.lat, stop.lng),
      }));
  }, [routes, mapCenter, userPosition]);

  const filteredStops = useMemo(() => {
    const q = stopSearch.toLowerCase().trim();
    let list = uniqueStops;
    if (q) {
      list = list.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        s.passingRoutes.some((r) => r.number?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q))
      );
    }
    if (stopSort === 'distance') list.sort((a, b) => a.distance - b.distance);
    else if (stopSort === 'routes') list.sort((a, b) => b.passingRoutes.length - a.passingRoutes.length);
    else if (stopSort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return list;
  }, [uniqueStops, stopSearch, stopSort]);

  const routesWithCount = useMemo(() => routes.map((r) => ({
    ...r, activeCount: vehicles.filter((v) => v.route_id === r.id && v.is_active).length,
  })), [routes, vehicles]);

  const filteredRoutesList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return routesWithCount.filter((r) => {
      if (routeTypeFilter !== 'all' && r.type !== routeTypeFilter) return false;
      if (!q) return true;
      return r.number?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q);
    });
  }, [routesWithCount, searchQuery, routeTypeFilter]);

  const favoriteRoutes = useMemo(() => routesWithCount.filter((r) => favorites.includes(r.id)), [routesWithCount, favorites]);

  const handleSelectRoute = useCallback((route) => {
    setSelectedRoute(route);
    if (window.innerWidth < 768) setSheetState('collapsed');
  }, [setSelectedRoute, setSheetState]);

  const handleSelectStop = useCallback((stop) => {
    setWatchedStop(stop);
    setSelectedStopDetail(stop);
    if (onFlyTo && stop.lat && stop.lng) onFlyTo({ lat: stop.lat, lng: stop.lng, zoom: 16 });
  }, [setWatchedStop, onFlyTo]);

  const isOpen = sheetState !== 'collapsed';
  const hasCity = !!selectedCity;

  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diff) > 40) {
      if (diff > 0 && sheetState !== 'full') setSheetState(sheetState === 'collapsed' ? 'half' : 'full');
      else if (diff < 0 && sheetState !== 'collapsed') setSheetState(sheetState === 'full' ? 'half' : 'collapsed');
    }
  };

  const counts = {
    stops: uniqueStops.length, routes: routes.length,
    favorites: favoriteRoutes.length + favDrivers.length, history: tripHistory.length,
  };

  const tabs = [
    { id: 'stops', icon: MapPin, label: t('bottomsheet.tabStops'), count: counts.stops },
    { id: 'routes', icon: Bus, label: t('bottomsheet.tabRoutes'), count: counts.routes },
    { id: 'favorites', icon: Heart, label: t('bottomsheet.tabFavorites'), count: counts.favorites },
    { id: 'history', icon: History, label: t('bottomsheet.tabHistory'), count: counts.history },
  ];

  return (
    <>
      {/* Desktop side panel */}
      <div
        className={`hidden md:flex flex-col absolute left-3 top-[140px] bottom-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-200/60 dark:border-slate-800/80 z-[400] overflow-hidden transition-all duration-300 ease-out ${isOpen ? 'w-[380px] opacity-100' : 'w-0 opacity-0 pointer-events-none border-0 p-0'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <HeaderBlock
          tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} counts={counts}
          stopSearch={stopSearch} setStopSearch={setStopSearch} searchQuery={searchQuery}
          setSearchQuery={setSearchQuery} routeTypeFilter={routeTypeFilter} setRouteTypeFilter={setRouteTypeFilter}
          selectedCity={selectedCity} routes={routes} vehicles={vehicles} hasCity={hasCity}
          stopSort={stopSort} setStopSort={setStopSort} filteredRoutesList={filteredRoutesList}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700" ref={listRef}>
          <TabContent
            activeTab={activeTab} filteredStops={filteredStops} visibleStopsCount={visibleStopsCount}
            onShowMore={() => setVisibleStopsCount((c) => c + STOPS_PAGE_SIZE)}
            filteredRoutesList={filteredRoutesList} favoriteRoutes={favoriteRoutes} tripHistory={tripHistory}
            selectedRoute={selectedRoute} handleSelectRoute={handleSelectRoute}
            handleSelectStop={handleSelectStop} toggleFavorite={toggleFavorite} favorites={favorites}
            watchedStop={watchedStop} favDrivers={favDrivers} favSubTab={favSubTab} setFavSubTab={setFavSubTab}
            onRemoveFavDriver={(id) => setFavDrivers((prev) => prev.filter((x) => x.id !== id))}
            onSelectFavDriver={onSelectFavDriver} hasCity={hasCity} routes={routes}
            setSelectedRoute={setSelectedRoute} selectedStopDetail={selectedStopDetail}
            setSelectedStopDetail={setSelectedStopDetail}
          />
        </div>
      </div>

      {/* Desktop toggle */}
      <button
        onClick={() => setSheetState(isOpen ? 'collapsed' : 'half')}
        className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-[450] w-7 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/80 shadow-lg items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer rounded-r-xl"
        style={{ left: isOpen ? 'calc(380px + 12px + 3px)' : '3px' }}
      >
        {isOpen ? <ChevronLeft size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
      </button>

      {/* Mobile toggle */}
      <button
        onClick={() => setSheetState(isOpen ? 'collapsed' : 'half')}
        className="md:hidden fixed left-0 top-1/2 -translate-y-1/2 z-[510] w-6 h-12 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/80 shadow-lg flex items-center justify-center cursor-pointer rounded-r-xl transition-all active:scale-95"
      >
        {isOpen ? <ChevronLeft size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
      </button>

      {/* Mobile bottom sheet */}
      <div
        className={`md:hidden fixed left-0 right-0 bottom-0 z-[500] bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl rounded-t-3xl shadow-[0_-8px_32px_rgba(15,23,42,0.15)] border-t border-slate-200/60 dark:border-slate-800/80 transition-all duration-300 ease-out flex flex-col ${sheetState === 'collapsed' ? 'h-[52px]' : sheetState === 'half' ? 'h-[52vh]' : 'h-[84vh]'}`}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setSheetState(sheetState === 'collapsed' ? 'half' : sheetState === 'half' ? 'full' : 'collapsed')}
          className="flex-shrink-0 flex flex-col items-center justify-center py-2.5 w-full cursor-pointer active:bg-slate-100 dark:active:bg-slate-800 transition-colors rounded-t-3xl"
        >
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mb-1.5" />
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={12} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              {sheetState === 'collapsed' ? (selectedCity?.name || t('bottomsheet.titleDefault')) : `${tabs.find((x) => x.id === activeTab)?.label} · ${counts[activeTab] || 0}`}
            </span>
          </div>
        </button>

        {isOpen && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <HeaderBlock
              tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} counts={counts}
              stopSearch={stopSearch} setStopSearch={setStopSearch} searchQuery={searchQuery}
              setSearchQuery={setSearchQuery} routeTypeFilter={routeTypeFilter} setRouteTypeFilter={setRouteTypeFilter}
              selectedCity={selectedCity} routes={routes} vehicles={vehicles} hasCity={hasCity}
              stopSort={stopSort} setStopSort={setStopSort} filteredRoutesList={filteredRoutesList}
            />
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700" ref={listRef}>
              <TabContent
                activeTab={activeTab} filteredStops={filteredStops} visibleStopsCount={visibleStopsCount}
                onShowMore={() => setVisibleStopsCount((c) => c + STOPS_PAGE_SIZE)}
                filteredRoutesList={filteredRoutesList} favoriteRoutes={favoriteRoutes} tripHistory={tripHistory}
                selectedRoute={selectedRoute} handleSelectRoute={handleSelectRoute}
                handleSelectStop={handleSelectStop} toggleFavorite={toggleFavorite} favorites={favorites}
                watchedStop={watchedStop} favDrivers={favDrivers} favSubTab={favSubTab} setFavSubTab={setFavSubTab}
                onRemoveFavDriver={(id) => setFavDrivers((prev) => prev.filter((x) => x.id !== id))}
                onSelectFavDriver={onSelectFavDriver} hasCity={hasCity} routes={routes}
                setSelectedRoute={setSelectedRoute} selectedStopDetail={selectedStopDetail}
                setSelectedStopDetail={setSelectedStopDetail}
              />
            </div>
          </div>
        )}
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-black/20 z-[490] backdrop-blur-sm" onClick={() => setSheetState('collapsed')} />
      )}
    </>
  );
}

function haversineApprox(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function HeaderBlock({ tabs, activeTab, setActiveTab, counts, stopSearch, setStopSearch, searchQuery, setSearchQuery, routeTypeFilter, setRouteTypeFilter, selectedCity, routes, vehicles, hasCity, stopSort, setStopSort, filteredRoutesList }) {
  const { t } = useLanguage();
  const headerTitle = selectedCity ? selectedCity.name : t('bottomsheet.titleDefault');
  const headerSubtitle = hasCity ? `${routes.length} маршрутов · ${counts.stops} остановок` : 'Выберите город';

  return (
    <div className="p-4 pb-2 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-br from-blue-600/[0.04] via-indigo-500/[0.02] to-transparent dark:from-blue-500/10 dark:via-transparent">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none truncate">
            {headerTitle}
          </h2>
          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1">
            {headerSubtitle}
          </p>
        </div>
        {hasCity && vehicles.length > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {vehicles.length} онлайн
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mt-3 bg-slate-900/[0.04] dark:bg-white/[0.06] p-1 rounded-2xl">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all relative ${active ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-slate-200/50 dark:ring-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              <TabIcon size={16} strokeWidth={active ? 2.4 : 1.8} />
              <span className={`text-[10px] font-bold mt-1 tracking-tight leading-none ${active ? '' : 'font-medium'}`}>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white dark:border-slate-900 ${active ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'}`}>
                  {tab.count > 99 ? '99+' : tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Stop search + sort */}
      {activeTab === 'stops' && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" placeholder="Поиск остановки или маршрута…"
              value={stopSearch} onChange={(e) => setStopSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white placeholder:text-slate-400"
            />
            {stopSearch && (
              <button onClick={() => setStopSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <SearchX size={12} className="text-slate-500" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {SORT_OPTIONS.map((opt) => (
              <button key={opt.id} onClick={() => setStopSort(opt.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold border transition-all ${stopSort === opt.id ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
                <opt.icon size={10} /> {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'routes' && (
        <div className="mt-3 space-y-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Поиск маршрута…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white placeholder:text-slate-400" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <SearchX size={12} className="text-slate-500" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {[{ id: 'all', label: 'Все' }, { id: 'bus', label: 'Автобус' }, { id: 'minibus', label: 'Маршрутка' }].map((f) => (
              <button key={f.id} onClick={() => setRouteTypeFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${routeTypeFilter === f.id ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
                {f.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] font-medium text-slate-400">{filteredRoutesList.length} из {routes.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StopCard({ stop, isWatched, isDetail, onSelect, onRouteClick, onToggleWatch }) {
  const distLabel = stop.distance < 1000 ? `${Math.round(stop.distance)} м` : `${(stop.distance / 1000).toFixed(1)} км`;
  if (isDetail) {
    return (
      <div className={`rounded-2xl border-2 overflow-hidden transition-all ${isWatched ? 'border-orange-400 bg-orange-50/30 dark:bg-orange-500/10' : 'border-blue-500 bg-blue-50/30 dark:bg-blue-500/10'} shadow-md`}>
        <div className="flex items-center gap-3 p-3.5">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isWatched ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white'}`}>
            <MapPin size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-[14px] text-slate-900 dark:text-white truncate">{stop.name || 'Остановка'}</h3>
              <span className="text-[10px] font-bold text-slate-400">{distLabel}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{stop.passingRoutes?.length || 0} маршрут{stop.passingRoutes?.length === 1 ? '' : stop.passingRoutes?.length < 5 ? 'а' : 'ов'}</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onSelect(stop); }} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>

        {stop.passingRoutes?.length > 0 && (
          <div className="px-3.5 pb-3 space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Маршруты</p>
            {stop.passingRoutes.map((r) => (
              <button key={r.id} onClick={(e) => { e.stopPropagation(); onRouteClick(r); }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 transition-all text-left active:scale-[0.98]">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-sm" style={{ backgroundColor: r.color || '#2563EB' }}>
                  #{r.number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-slate-900 dark:text-white truncate">{r.name || `Маршрут #${r.number}`}</p>
                  <p className="text-[10px] text-slate-500">{r.type === 'minibus' ? 'Маршрутка' : 'Автобус'} · {r.stops?.length || 0} ост.</p>
                </div>
                <ArrowUpRight size={13} className="text-slate-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="flex border-t border-slate-100 dark:border-slate-700/50">
          <button onClick={(e) => { e.stopPropagation(); onToggleWatch(stop); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-colors ${isWatched ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 hover:text-orange-500'}`}>
            {isWatched ? <><EyeOff size={13} /> Слежу</> : <><Eye size={13} /> Следить</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div onClick={() => onSelect(stop)}
      className={`group flex items-center gap-3 p-3 bg-white dark:bg-slate-800/60 rounded-xl border transition-all cursor-pointer active:scale-[0.98] ${isWatched ? 'border-orange-300 bg-orange-50/40 dark:bg-orange-500/10 shadow-sm' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isWatched ? 'bg-orange-500 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
        <MapPin size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-[13px] text-slate-900 dark:text-white truncate">{stop.name || 'Остановка'}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-medium text-slate-400">{distLabel}</span>
          <span className="text-slate-300">·</span>
          <span className="text-[10px] font-medium text-slate-400">{stop.passingRoutes?.length || 0} маршр.</span>
        </div>
        {stop.passingRoutes?.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {stop.passingRoutes.slice(0, 5).map((r) => (
              <span key={r.id} className="inline-flex items-center text-[10px] font-black text-white px-2 py-0.5 rounded-md shadow-sm" style={{ backgroundColor: r.color || '#2563EB' }}>
                {r.number}
              </span>
            ))}
            {stop.passingRoutes.length > 5 && (
              <span className="inline-flex items-center text-[10px] font-bold text-slate-400 px-1.5 py-0.5">+{stop.passingRoutes.length - 5}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onToggleWatch(stop); }}
          className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${isWatched ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 hover:text-orange-500 hover:border-orange-200'}`}>
          {isWatched ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </div>
  );
}

function TabContent({ activeTab, filteredStops, visibleStopsCount, onShowMore, filteredRoutesList, favoriteRoutes, tripHistory, selectedRoute, handleSelectRoute, handleSelectStop, toggleFavorite, favorites, watchedStop, favDrivers, favSubTab, setFavSubTab, onRemoveFavDriver, onSelectFavDriver, hasCity, routes, setSelectedRoute, selectedStopDetail, setSelectedStopDetail }) {

  if (activeTab === 'stops') {
    if (!hasCity) {
      return <EmptyState icon={MapPin} title="Выберите город" desc="Выберите город вверху, чтобы увидеть ближайшие остановки." />;
    }
    if (!filteredStops.length) {
      return <EmptyState icon={SearchX} title="Остановки не найдены" desc="Попробуйте изменить поиск или сортировку." />;
    }
    const visible = filteredStops.slice(0, visibleStopsCount);
    const hasMore = visibleStopsCount < filteredStops.length;
    return (
      <div className="space-y-2.5">
        {selectedStopDetail && (
          <StopCard
            stop={selectedStopDetail}
            isWatched={watchedStop && Math.abs(selectedStopDetail.lat - watchedStop.lat) < 0.0001 && Math.abs(selectedStopDetail.lng - watchedStop.lng) < 0.0001}
            isDetail={true}
            onSelect={() => setSelectedStopDetail(null)}
            onRouteClick={handleSelectRoute}
            onToggleWatch={handleSelectStop}
          />
        )}
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            Найдено {filteredStops.length} остановок
          </span>
        </div>
        {visible.map((stop, i) => {
          const isWatched = watchedStop && Math.abs(stop.lat - watchedStop.lat) < 0.0001 && Math.abs(stop.lng - watchedStop.lng) < 0.0001;
          const isExpanded = selectedStopDetail && Math.abs(stop.lat - selectedStopDetail.lat) < 0.0001 && Math.abs(stop.lng - selectedStopDetail.lng) < 0.0001;
          if (isExpanded && i > 0) return null;
          return (
            <StopCard
              key={`${stop.lat}-${stop.lng}-${i}`}
              stop={stop}
              isWatched={isWatched}
              isDetail={false}
              onSelect={handleSelectStop}
              onRouteClick={handleSelectRoute}
              onToggleWatch={handleSelectStop}
            />
          );
        })}
        {hasMore && (
          <button onClick={onShowMore} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            Показать ещё {Math.min(STOPS_PAGE_SIZE, filteredStops.length - visibleStopsCount)} из {filteredStops.length}
          </button>
        )}
      </div>
    );
  }

  if (activeTab === 'routes') {
    if (!hasCity) return <EmptyState icon={Bus} title="Выберите город" desc="Выберите город, чтобы увидеть доступные маршруты." />;
    if (!filteredRoutesList.length) return <EmptyState icon={SearchX} title="Маршруты не найдены" desc="Попробуйте изменить поиск или фильтры." />;
    return (
      <div className="space-y-2.5">
        {selectedRoute && (
          <button onClick={() => setSelectedRoute(null)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-[0.98] transition-all">
            <Eye size={14} /> Показать все маршруты · {routes.length}
          </button>
        )}
        {filteredRoutesList.map((route) => {
          const isSelected = selectedRoute?.id === route.id;
          const isFav = favorites.includes(route.id);
          return (
            <div key={route.id} onClick={() => handleSelectRoute(route)}
              className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all cursor-pointer active:scale-[0.98] ${isSelected ? 'bg-blue-50/70 dark:bg-blue-500/10 border-blue-500 shadow-md' : 'bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md'}`}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-md" style={{ backgroundColor: route.color || '#2563EB' }}>#{route.number}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-[13px] text-slate-900 dark:text-white truncate">{route.name || `Маршрут #${route.number}`}</h3>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] mt-1 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${route.activeCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700 dark:text-slate-300'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${route.activeCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    {route.activeCount > 0 ? `${route.activeCount} онлайн` : 'Нет машин'}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{route.type === 'minibus' ? 'Маршрутка' : 'Автобус'}</span>
                  {route.stops?.length > 0 && <><span className="text-slate-300">·</span><span className="text-slate-400">{route.stops.length} ост.</span></>}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); toggleFavorite(route); }}
                className={`w-9 h-9 rounded-xl flex items-center justify-center border-2 transition-all active:scale-95 ${isFav ? 'bg-red-50 border-red-200 text-red-500 dark:bg-red-500/10 dark:border-red-500/30' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 hover:text-red-500 hover:border-red-200'}`}>
                <Heart size={15} fill={isFav ? '#EF4444' : 'none'} className={isFav ? 'text-red-500' : ''} />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  if (activeTab === 'favorites') {
    const hasAny = favoriteRoutes.length > 0 || favDrivers.length > 0;
    if (!hasAny) return <EmptyState icon={Heart} title="Нет избранных" desc="Нажмите ♡ на карточке маршрута, чтобы добавить его сюда." />;
    return (
      <div className="space-y-4">
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {[{ id: 'routes', label: `Маршруты · ${favoriteRoutes.length}`, icon: Bus }, { id: 'drivers', label: `Водители · ${favDrivers.length}`, icon: User }].map((s) => (
            <button key={s.id} onClick={() => setFavSubTab(s.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${favSubTab === s.id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
              <s.icon size={13} /> {s.label}
            </button>
          ))}
        </div>
        {favSubTab === 'routes' ? (
          favoriteRoutes.length ? (
            <div className="space-y-2.5">
              {favoriteRoutes.map((route) => (
                <div key={route.id} onClick={() => handleSelectRoute(route)} className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer transition-all active:scale-[0.98]">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm" style={{ backgroundColor: route.color || '#2563EB' }}>#{route.number}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[13px] text-slate-900 dark:text-white truncate">{route.name || `Маршрут #${route.number}`}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${route.activeCount ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {route.activeCount ? `${route.activeCount} на линии` : 'Нет машин'} · {route.type === 'minibus' ? 'Маршрутка' : 'Автобус'}
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleFavorite(route); }} className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center text-red-500">
                    <Star size={14} fill="#EF4444" />
                  </button>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={Bus} title="Нет избранных маршрутов" desc="Нажмите ♡ на карточке маршрута." />
        ) : (
          favDrivers.length ? (
            <div className="space-y-2">
              {favDrivers.map((d) => (
                <div key={d.id} onClick={() => onSelectFavDriver?.(d.driver_id)} className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 cursor-pointer transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <User size={16} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[13px] text-slate-900 dark:text-white truncate">{d.driver_name || 'Водитель'}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{d.vehicle_number && `№ ${d.vehicle_number}`}{d.route_number && ` · #${d.route_number}`}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); supabase.from('favorite_drivers').delete().eq('id', d.id).then(({ error }) => { if (!error) onRemoveFavDriver?.(d.id); }).catch(() => {}); }}
                    className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors">
                    <Heart size={13} fill="#EF4444" className="text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={User} title="Нет избранных водителей" desc="Добавляйте водителей в избранное с карты." />
        )}
      </div>
    );
  }

  if (activeTab === 'history') {
    if (!tripHistory.length) return <EmptyState icon={Inbox} title="История пуста" desc="Здесь появятся ваши поездки и оплаты." />;
    const groups = {};
    tripHistory.forEach((item) => {
      const d = new Date(item.created_at);
      const key = d.toLocaleDateString('ru', { day: '2-digit', month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return (
      <div className="space-y-5">
        {Object.entries(groups).map(([date, items]) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Clock3 size={12} className="text-slate-400" />
              <span className="text-[11px] font-black tracking-widest uppercase text-slate-500 dark:text-slate-400">{date}</span>
              <span className="flex-1 h-px bg-slate-100 dark:bg-slate-800 ml-2" />
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((trip) => {
                const isPayment = trip.isPayment;
                const isSelected = !isPayment && selectedRoute?.id === trip.route_id;
                return (
                  <div key={trip.id}
                    onClick={() => { if (!isPayment && trip.route_id) handleSelectRoute({ id: trip.route_id, number: trip.route_number, name: trip.route_name, color: trip.route_color, type: trip.route_type }); }}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ${isPayment ? 'bg-emerald-50/60 border-emerald-100' : isSelected ? 'bg-blue-50/70 border-blue-500 shadow-md' : 'bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:border-slate-200 cursor-pointer active:scale-[0.98]'}`}>
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm ${isPayment ? 'bg-emerald-500' : ''}`} style={!isPayment ? { backgroundColor: trip.route_color || '#2563EB' } : undefined}>
                      {isPayment ? '$' : `#${trip.route_number}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-[13px] text-slate-900 dark:text-white truncate">{isPayment ? trip.route_name : (trip.route_name || `Маршрут #${trip.route_number}`)}</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <span className={isPayment ? 'text-emerald-600 font-bold' : ''}>{isPayment ? `${trip.amount} TJS` : `${trip.city_name || '—'} · ${trip.route_type === 'minibus' ? 'Маршрутка' : 'Автобус'}`}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-[10px]">{new Date(trip.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function EmptyState({ icon: Icon, title, desc }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
        <Icon size={24} className="text-slate-400 dark:text-slate-500" />
      </div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</p>
      {desc && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed max-w-[260px] mx-auto">{desc}</p>}
    </div>
  );
}
