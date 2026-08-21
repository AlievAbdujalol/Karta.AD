import { useState, useEffect, useRef } from 'react';
import { MapPin, Bus, Heart, History, Sparkles, ChevronLeft, ChevronRight, User, GripHorizontal } from 'lucide-react';
import { TripLog } from '@/api/entities';
import { supabase } from '@/api/supabase';
import { useLanguage } from '@/lib/useLanguage';

export default function BottomSheet({
  selectedCity,
  routes = [],
  vehicles = [],
  favorites = [],
  toggleFavorite,
  selectedRoute,
  setSelectedRoute,
  mapCenter,
  currentUser,
  watchedStop,
  setWatchedStop,
  sheetState,
  setSheetState,
  activeTab,
  setActiveTab,
  onSelectFavDriver,
}) {
  const [tripHistory, setTripHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [favDrivers, setFavDrivers] = useState([]);
  const { t } = useLanguage();
  const touchStartY = useRef(0);

  useEffect(() => {
    if (!currentUser?.id) { setFavDrivers([]); return; }
    supabase.from('favorite_drivers').select('*').eq('user_id', currentUser.id)
      .then(({ data }) => setFavDrivers(data || [])).catch(() => {});
  }, [currentUser?.id]);

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
          id: tx.id, route_id: null, route_number: '\u2014',
          route_name: tx.recipient_id ? '\u041E\u043F\u043B\u0430\u0442\u0430 \u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044E' : '\u041F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0431\u0430\u043B\u0430\u043D\u0441\u0430',
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

  const getUniqueStops = () => {
    if (!selectedCity || !routes.length) return [];
    const allStops = [];
    const seenStops = new Set();
    routes.forEach((route) => {
      (route.stops || []).forEach((stop) => {
        if (!stop.lat || !stop.lng) return;
        const key = `${stop.lat.toFixed(5)}-${stop.lng.toFixed(5)}`;
        if (!seenStops.has(key)) {
          seenStops.add(key);
          allStops.push({ ...stop, passingRoutes: [route] });
        } else {
          const existing = allStops.find((s) => `${s.lat.toFixed(5)}-${s.lng.toFixed(5)}` === key);
          if (existing && !existing.passingRoutes.find((r) => r.id === route.id)) {
            existing.passingRoutes.push(route);
          }
        }
      });
    });
    const [refLat, refLng] = mapCenter;
    return allStops
      .map((stop) => ({ ...stop, distance: Math.hypot(stop.lat - refLat, stop.lng - refLng) * 111300 }))
      .sort((a, b) => a.distance - b.distance);
  };

  const uniqueStops = getUniqueStops();
  const routesWithCount = routes.map((r) => ({
    ...r,
    activeCount: vehicles.filter((v) => v.route_id === r.id && v.is_active).length,
  }));
  const filteredRoutesList = routesWithCount.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    return !q || r.number?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q);
  });
  const favoriteRoutes = routesWithCount.filter((r) => favorites.includes(r.id));

  const handleSelectRoute = (route) => { setSelectedRoute(route); setSheetState('collapsed'); };
  const handleSelectStop = (stop) => { setWatchedStop(stop); setSheetState('collapsed'); };

  const tabs = [
    { id: 'stops', icon: MapPin, label: t('bottomsheet.tabStops') },
    { id: 'routes', icon: Bus, label: t('bottomsheet.tabRoutes') },
    { id: 'favorites', icon: Heart, label: t('bottomsheet.tabFavorites') },
    { id: 'history', icon: History, label: t('bottomsheet.tabHistory') },
  ];

  const isOpen = sheetState !== 'collapsed';

  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diff) > 40) {
      if (diff > 0 && sheetState !== 'full') setSheetState(sheetState === 'collapsed' ? 'half' : 'full');
      else if (diff < 0 && sheetState !== 'collapsed') setSheetState(sheetState === 'full' ? 'half' : 'collapsed');
    }
  };

  const panelClasses = 'flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-2 md:space-y-3 scrollbar-thin scrollbar-thumb-slate-200';
  const headerClasses = 'p-4 md:p-5 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-r from-blue-600/5 to-sky-500/5';

  const tabButtons = (
    <div className="flex gap-1.5 mt-2 bg-slate-100/80 dark:bg-slate-850 p-1 rounded-xl">
      {tabs.map((tab) => {
        const TabIcon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg transition-all ${
              active
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <TabIcon size={16} className={active ? 'text-blue-600 dark:text-blue-400' : ''} />
            <span className="text-[10px] font-bold mt-1 tracking-tight">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* ===== DESKTOP: Side panel ===== */}
      <div
        className={`hidden md:flex flex-col absolute left-3 top-[140px] bottom-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-200/60 dark:border-slate-800/80 z-[400] overflow-hidden transition-all duration-300 ease-out ${
          isOpen ? 'w-[380px] opacity-100' : 'w-0 opacity-0 pointer-events-none border-0 p-0'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={headerClasses}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              {selectedCity ? selectedCity.name : t('bottomsheet.titleDefault')}
            </h2>
          </div>
          {activeTab === 'routes' && (
            <input type="text" placeholder={t('bottomsheet.searchRoutePlaceholder')} value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl outline-none focus:border-blue-500 transition-all dark:text-white" />
          )}
          {tabButtons}
        </div>
        <div className={panelClasses}>
          <TabContent activeTab={activeTab} uniqueStops={uniqueStops} filteredRoutesList={filteredRoutesList}
            favoriteRoutes={favoriteRoutes} tripHistory={tripHistory} selectedRoute={selectedRoute}
            handleSelectRoute={handleSelectRoute} handleSelectStop={handleSelectStop} toggleFavorite={toggleFavorite}
            favorites={favorites} watchedStop={watchedStop} favDrivers={favDrivers}
            onRemoveFavDriver={(id) => setFavDrivers(prev => prev.filter(x => x.id !== id))}
            onSelectFavDriver={onSelectFavDriver} />
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

      {/* ===== MOBILE: Bottom sheet ===== */}
      <div
        className={`md:hidden fixed left-0 right-0 bottom-0 z-[500] bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl rounded-t-3xl shadow-[0_-8px_32px_rgba(15,23,42,0.15)] border-t border-slate-200/60 dark:border-slate-800/80 transition-all duration-300 ease-out flex flex-col ${
          sheetState === 'collapsed' ? 'h-[52px]' : sheetState === 'half' ? 'h-[50vh]' : 'h-[85vh]'
        }`}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setSheetState(sheetState === 'collapsed' ? 'half' : sheetState === 'half' ? 'full' : 'collapsed')}
          className="flex-shrink-0 flex flex-col items-center justify-center py-2 w-full cursor-pointer active:bg-slate-100 dark:active:bg-slate-800 transition-colors rounded-t-3xl"
        >
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mb-1" />
          <div className="flex items-center gap-1.5">
            <GripHorizontal size={12} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {sheetState === 'collapsed' ? (selectedCity?.name || t('bottomsheet.titleDefault')) : ''}
            </span>
          </div>
        </button>

        {isOpen && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className={headerClasses}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-blue-600 dark:text-blue-400" />
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  {selectedCity ? selectedCity.name : t('bottomsheet.titleDefault')}
                </h2>
              </div>
              {activeTab === 'routes' && (
                <input type="text" placeholder={t('bottomsheet.searchRoutePlaceholder')} value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl outline-none focus:border-blue-500 transition-all dark:text-white" />
              )}
              {tabButtons}
            </div>
            <div className={panelClasses}>
              <TabContent activeTab={activeTab} uniqueStops={uniqueStops} filteredRoutesList={filteredRoutesList}
                favoriteRoutes={favoriteRoutes} tripHistory={tripHistory} selectedRoute={selectedRoute}
                handleSelectRoute={handleSelectRoute} handleSelectStop={handleSelectStop} toggleFavorite={toggleFavorite}
                favorites={favorites} watchedStop={watchedStop} favDrivers={favDrivers}
                onRemoveFavDriver={(id) => setFavDrivers(prev => prev.filter(x => x.id !== id))}
                onSelectFavDriver={onSelectFavDriver} />
            </div>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-black/20 z-[490] backdrop-blur-sm"
          onClick={() => setSheetState('collapsed')} />
      )}
    </>
  );
}

function TabContent({ activeTab, uniqueStops, filteredRoutesList, favoriteRoutes, tripHistory, selectedRoute, handleSelectRoute, handleSelectStop, toggleFavorite, favorites, watchedStop, favDrivers = [], onRemoveFavDriver, onSelectFavDriver }) {
  const { t } = useLanguage();

  if (activeTab === 'stops') {
    if (!uniqueStops.length) return (
      <div className="text-center py-10 text-slate-400 dark:text-slate-500">
        <MapPin size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-xs">{t('bottomsheet.noStops')}</p>
      </div>
    );
    return uniqueStops.slice(0, 15).map((stop, i) => {
      const isWatched = watchedStop && Math.abs(stop.lat - watchedStop.lat) < 0.0001 && Math.abs(stop.lng - watchedStop.lng) < 0.0001;
      return (
        <div key={i} onClick={() => handleSelectStop(stop)}
          className={`flex items-start gap-3 p-3 md:p-3.5 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] overflow-hidden ${isWatched ? 'border-orange-500/50 bg-orange-50/30 dark:bg-orange-500/5' : 'border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/70'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isWatched ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' : 'bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400'}`}>
            <MapPin size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xs text-slate-850 dark:text-slate-100 truncate">{stop.name || t('bottomsheet.stopDefaultName')}</h3>
            <p className="text-[10px] text-slate-450 dark:text-slate-400 mt-0.5">
              ~ {stop.distance < 1000 ? `${Math.round(stop.distance)} m` : `${(stop.distance / 1000).toFixed(1)} km`} {t('bottomsheet.fromCenter')}
            </p>
            {stop.passingRoutes && (
              <div className="flex flex-wrap gap-1 mt-2">
                {stop.passingRoutes.map((r, ri) => (
                  <span key={ri} onClick={(e) => { e.stopPropagation(); handleSelectRoute(r); }}
                    style={{ backgroundColor: r.color || '#1565C0' }}
                    className="text-[9px] text-white font-extrabold px-2 py-0.5 rounded-lg active:scale-95 transition-transform">
                    #{r.number}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    });
  }

  if (activeTab === 'routes') {
    if (!filteredRoutesList.length) return (
      <div className="text-center py-10 text-slate-400 dark:text-slate-500">
        <Bus size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-xs">{t('bottomsheet.noRoutes')}</p>
      </div>
    );
    return filteredRoutesList.map((route) => {
      const isSelected = selectedRoute?.id === route.id;
      const isFav = favorites.includes(route.id);
      return (
        <div key={route.id} onClick={() => handleSelectRoute(route)}
          className={`flex items-center gap-3 p-3 md:p-3.5 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] overflow-hidden ${isSelected ? 'border-blue-500/50 bg-blue-50/20 dark:bg-blue-500/5' : 'border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/70'}`}>
          <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm" style={{ backgroundColor: route.color || '#2563EB' }}>
            #{route.number}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xs text-slate-850 dark:text-slate-100 truncate">{route.name || `${t('bottomsheet.routeDefaultName')} #${route.number}`}</h3>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-450 dark:text-slate-400 mt-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${route.activeCount > 0 ? 'bg-green-500' : 'bg-slate-350 dark:bg-slate-650'}`} />
              <span>{route.activeCount > 0 ? `${route.activeCount} ${t('onLine')}` : t('noVehicles')}</span>
              <span>·</span>
              <span>{route.type === 'minibus' ? t('bottomsheet.minibusLabel') : t('bottomsheet.busLabel')}</span>
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(route); }}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors">
            <Heart size={15} fill={isFav ? '#EF4444' : 'none'} className={isFav ? 'text-red-500' : ''} />
          </button>
        </div>
      );
    });
  }

  if (activeTab === 'favorites') {
    if (!favDrivers.length) return (
      <div className="text-center py-12 text-slate-450 dark:text-slate-500">
        <Heart size={36} className="mx-auto mb-3 opacity-30 text-slate-400" />
        <p className="text-xs font-semibold">{t('bottomsheet.favoritesEmpty')}</p>
        <p className="text-[10px] text-slate-400 mt-1 px-4">{t('bottomsheet.favoritesHint')}</p>
      </div>
    );
    return (
      <div className="space-y-2">
        {favDrivers.map(d => (
          <div key={d.id} onClick={() => onSelectFavDriver?.(d.driver_id)}
            className="flex items-center gap-3 p-3 bg-white/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800/50 cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800/50 transition-colors">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">{d.driver_name || t('bottomsheet.driverDefault')}</p>
              <p className="text-[10px] text-slate-400">{d.vehicle_number && `№ ${d.vehicle_number}`}{d.route_number && ` · #${d.route_number}`}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); supabase.from('favorite_drivers').delete().eq('id', d.id).then(({ error }) => { if (!error) onRemoveFavDriver?.(d.id); }).catch(() => {}); }}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-red-500">
              <Heart size={13} fill="#EF4444" className="text-red-500" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (activeTab === 'history') {
    if (!tripHistory.length) return (
      <div className="text-center py-10 text-slate-450 dark:text-slate-500">
        <History size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
        <p className="text-xs">{t('bottomsheet.historyEmpty')}</p>
      </div>
    );
    return tripHistory.map((trip) => {
      const isPayment = trip.isPayment;
      const isSelected = !isPayment && selectedRoute?.id === trip.route_id;
      return (
        <div key={trip.id}
          onClick={() => { if (!isPayment) handleSelectRoute({ id: trip.route_id, number: trip.route_number, name: trip.route_name, color: trip.route_color, type: trip.route_type }); }}
          className={`flex items-center gap-3 p-3.5 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/70 transition-all active:scale-[0.98] overflow-hidden ${isPayment ? 'opacity-80 cursor-default' : 'cursor-pointer'} ${isSelected ? 'border-blue-500/50 bg-blue-50/20 dark:bg-blue-500/5' : ''}`}>
          {isPayment ? (
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-emerald-500">$</span>
          ) : (
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: trip.route_color || '#1565C0' }}>#{trip.route_number}</span>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xs text-slate-850 dark:text-slate-100 truncate">{isPayment ? (trip.route_name || '\u041F\u043B\u0430\u0442\u0435\u0436') : (trip.route_name || `${t('bottomsheet.routeDefaultName')} #${trip.route_number}`)}</h3>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{isPayment ? `${trip.amount} TJS` : `${trip.city_name || t('bottomsheet.cityUnknown')} \u2022 ${trip.route_type === 'minibus' ? t('bottomsheet.minibusLabel') : t('bottomsheet.busLabel')}`}</p>
          </div>
          <span className="text-[9px] text-slate-400 font-medium">{new Date(trip.created_at).toLocaleDateString('ru', { month: 'short', day: 'numeric' })}</span>
        </div>
      );
    });
  }

  return null;
}
