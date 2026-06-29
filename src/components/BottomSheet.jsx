import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Bus, Heart, History, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';

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
  sheetState, // 'collapsed' | 'half' | 'expanded'
  setSheetState,
  activeTab, // 'stops' | 'routes' | 'favorites' | 'history'
  setActiveTab,
}) {
  const [tripHistory, setTripHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch search history (TripLog)
  useEffect(() => {
    if (currentUser?.id) {
      base44.entities.TripLog.filter({ user_id: currentUser.id }, '-created_at')
        .then((logs) => {
          // Keep unique routes in history
          const uniqueLogs = [];
          const seen = new Set();
          logs.forEach((log) => {
            if (!seen.has(log.route_id)) {
              seen.add(log.route_id);
              uniqueLogs.push(log);
            }
          });
          setTripHistory(uniqueLogs.slice(0, 10));
        })
        .catch(() => {});
    }
  }, [currentUser?.id, selectedRoute]);

  // 1. Calculate unique stops in the selected city and count their passing routes
  const getUniqueStops = () => {
    if (!selectedCity || !routes.length) return [];
    const allStops = [];
    const seenStops = new Set();

    routes.forEach((route) => {
      if (route.stops) {
        route.stops.forEach((stop) => {
          if (!stop.lat || !stop.lng) return;
          // group key based on 5 decimals (approx 1 meter precision)
          const key = `${stop.lat.toFixed(5)}-${stop.lng.toFixed(5)}`;
          if (!seenStops.has(key)) {
            seenStops.add(key);
            allStops.push({
              ...stop,
              passingRoutes: [route],
            });
          } else {
            const existing = allStops.find(
              (s) => `${s.lat.toFixed(5)}-${s.lng.toFixed(5)}` === key
            );
            if (existing && !existing.passingRoutes.find((r) => r.id === route.id)) {
              existing.passingRoutes.push(route);
            }
          }
        });
      }
    });

    // Sort by distance to current map center
    const refLat = mapCenter[0];
    const refLng = mapCenter[1];
    return allStops
      .map((stop) => {
        // Distance in meters (rough estimate)
        const dLat = stop.lat - refLat;
        const dLng = stop.lng - refLng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111300;
        return { ...stop, distance: dist };
      })
      .sort((a, b) => a.distance - b.distance);
  };

  const uniqueStops = getUniqueStops();

  // 2. Active routes with vehicle count
  const routesWithActiveCount = routes.map((r) => {
    const activeVehicles = vehicles.filter((v) => v.route_id === r.id && v.is_active);
    return { ...r, activeCount: activeVehicles.length };
  });

  // Filter routes based on search query
  const filteredRoutesList = routesWithActiveCount.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      r.number?.toLowerCase().includes(q) ||
      r.name?.toLowerCase().includes(q)
    );
  });

  // 3. User favorites mapped to current city routes
  const favoriteRoutes = routesWithActiveCount.filter((r) => favorites.includes(r.id));

  // Switch sheet state for mobile
  const cycleState = () => {
    if (sheetState === 'collapsed') setSheetState('half');
    else if (sheetState === 'half') setSheetState('expanded');
    else setSheetState('collapsed');
  };

  const handleSelectRoute = (route) => {
    setSelectedRoute(route);
    setSheetState('collapsed');
  };

  const handleSelectStop = (stop) => {
    setWatchedStop(stop);
    // Focus the stop on the map (map controls will auto center or map hook handles center)
    // We can also dispatch a custom event or map trigger if needed.
    // For now we set watchedStop which is supported in Home.jsx
    setSheetState('collapsed');
  };

  const tabs = [
    { id: 'stops', icon: MapPin, label: 'Ближайшие' },
    { id: 'routes', icon: Bus, label: 'Транспорт' },
    { id: 'favorites', icon: Heart, label: 'Избранное' },
    { id: 'history', icon: History, label: 'История' },
  ];

  return (
    <>
      {/* DESKTOP SIDEBAR - FLOATS ON THE LEFT */}
      <div
        className="hidden md:flex flex-col absolute left-4 top-24 bottom-6 w-[380px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-[24px] shadow-2xl border border-slate-100 dark:border-slate-800/80 z-[1000] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-r from-blue-600/5 to-sky-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              {selectedCity ? selectedCity.name : 'Транспортная Панель'}
            </h2>
          </div>

          {/* Desktop Search */}
          {activeTab === 'routes' && (
            <input
              type="text"
              placeholder="Поиск маршрута..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl outline-none focus:border-blue-500 transition-all dark:text-white"
            />
          )}

          {/* Tab buttons */}
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
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
          <TabContent
            activeTab={activeTab}
            uniqueStops={uniqueStops}
            filteredRoutesList={filteredRoutesList}
            favoriteRoutes={favoriteRoutes}
            tripHistory={tripHistory}
            selectedRoute={selectedRoute}
            handleSelectRoute={handleSelectRoute}
            handleSelectStop={handleSelectStop}
            toggleFavorite={toggleFavorite}
            favorites={favorites}
            watchedStop={watchedStop}
          />
        </div>
      </div>

      {/* MOBILE BOTTOM SHEET - DRAGGABLE/SLIDABLE PANEL */}
      <motion.div
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800/80 z-[1000] shadow-2xl flex flex-col rounded-t-[28px]"
        initial="half"
        animate={sheetState}
        variants={{
          collapsed: { y: 'calc(100% - 64px)' },
          half: { y: 'calc(100% - 340px)' },
          expanded: { y: '80px' },
        }}
        transition={{ type: 'spring', damping: 24, stiffness: 200 }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ height: 'calc(100dvh - 80px)' }}
      >
        {/* Handle / Header */}
        <div
          className="flex flex-col items-center pt-2 pb-3 px-4 cursor-pointer select-none border-b border-slate-50 dark:border-slate-800/50"
          onClick={cycleState}
        >
          {/* Drag Pill */}
          <div className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mb-3" />

          {/* Compact row of controls */}
          <div className="w-full flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} className="text-blue-500" />
              {selectedCity ? selectedCity.name : 'Транспортная Панель'}
            </span>
            <div className="flex gap-2">
              {sheetState === 'collapsed' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {/* Search bar inside mobile sheet */}
          {activeTab === 'routes' && sheetState !== 'collapsed' && (
            <input
              type="text"
              placeholder="Поиск маршрута..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => {
                e.stopPropagation();
                if (sheetState !== 'expanded') setSheetState('expanded');
              }}
              className="w-full px-4 py-2 mt-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl outline-none dark:text-white"
            />
          )}

          {/* Tab switcher */}
          <div className="flex gap-1.5 mt-3 w-full bg-slate-100/80 dark:bg-slate-850 p-0.5 rounded-xl">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab(tab.id);
                    if (sheetState === 'collapsed') setSheetState('half');
                  }}
                  className={`flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <TabIcon size={14} />
                  <span className="text-[9px] font-bold mt-1 tracking-tight">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable list content */}
        <div className="flex-1 overflow-y-auto p-4 pb-12 space-y-3">
          <TabContent
            activeTab={activeTab}
            uniqueStops={uniqueStops}
            filteredRoutesList={filteredRoutesList}
            favoriteRoutes={favoriteRoutes}
            tripHistory={tripHistory}
            selectedRoute={selectedRoute}
            handleSelectRoute={handleSelectRoute}
            handleSelectStop={handleSelectStop}
            toggleFavorite={toggleFavorite}
            favorites={favorites}
            watchedStop={watchedStop}
          />
        </div>
      </motion.div>
    </>
  );
}

// Sub-component to clean up list item rendering
function TabContent({
  activeTab,
  uniqueStops,
  filteredRoutesList,
  favoriteRoutes,
  tripHistory,
  selectedRoute,
  handleSelectRoute,
  handleSelectStop,
  toggleFavorite,
  favorites,
  watchedStop,
}) {
  if (activeTab === 'stops') {
    if (!uniqueStops.length) {
      return (
        <div className="text-center py-10 text-slate-400 dark:text-slate-500">
          <MapPin size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">Остановок не найдено в этом городе</p>
        </div>
      );
    }
    return uniqueStops.slice(0, 15).map((stop, i) => {
      const isWatched = watchedStop &&
        Math.abs(stop.lat - watchedStop.lat) < 0.0001 &&
        Math.abs(stop.lng - watchedStop.lng) < 0.0001;

      return (
        <div
          key={i}
          onClick={() => handleSelectStop(stop)}
          className={`flex items-start gap-3 p-3.5 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] ${
            isWatched
              ? 'border-orange-500/50 bg-orange-50/30 dark:bg-orange-500/5'
              : 'border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/70'
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isWatched ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' : 'bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400'
          }`}>
            <MapPin size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xs text-slate-850 dark:text-slate-100 truncate">{stop.name || 'Остановка'}</h3>
            <p className="text-[10px] text-slate-450 dark:text-slate-400 mt-0.5">
              ≈ {stop.distance < 1000 ? `${Math.round(stop.distance)} м` : `${(stop.distance / 1000).toFixed(1)} км`} от центра
            </p>
            {stop.passingRoutes && (
              <div className="flex flex-wrap gap-1 mt-2">
                {stop.passingRoutes.map((r, ri) => (
                  <span
                    key={ri}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectRoute(r);
                    }}
                    style={{ backgroundColor: r.color || '#1565C0' }}
                    className="text-[9px] text-white font-extrabold px-2 py-0.5 rounded-lg active:scale-95 transition-transform"
                  >
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
    if (!filteredRoutesList.length) {
      return (
        <div className="text-center py-10 text-slate-400 dark:text-slate-500">
          <Bus size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">Маршруты не найдены</p>
        </div>
      );
    }
    return filteredRoutesList.map((route) => {
      const isSelected = selectedRoute && selectedRoute.id === route.id;
      const isFav = favorites.includes(route.id);
      return (
        <div
          key={route.id}
          onClick={() => handleSelectRoute(route)}
          className={`flex items-center gap-3 p-3.5 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] ${
            isSelected
              ? 'border-blue-500/50 bg-blue-50/20 dark:bg-blue-500/5'
              : 'border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/70'
          }`}
        >
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm"
            style={{ backgroundColor: route.color || '#2563EB' }}
          >
            #{route.number}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xs text-slate-850 dark:text-slate-100 truncate">
              {route.name || `Маршрут #${route.number}`}
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-450 dark:text-slate-400 mt-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${route.activeCount > 0 ? 'bg-green-500' : 'bg-slate-350 dark:bg-slate-650'}`} />
              <span>
                {route.activeCount > 0
                  ? `${route.activeCount} на линии`
                  : 'Нет машин'}
              </span>
              <span>•</span>
              <span>{route.type === 'minibus' ? 'Маршрутка' : 'Автобус'}</span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(route);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors"
          >
            <Heart size={15} fill={isFav ? '#EF4444' : 'none'} className={isFav ? 'text-red-500' : ''} />
          </button>
        </div>
      );
    });
  }

  if (activeTab === 'favorites') {
    if (!favoriteRoutes.length) {
      return (
        <div className="text-center py-12 text-slate-450 dark:text-slate-500">
          <Heart size={36} className="mx-auto mb-3 opacity-30 text-slate-400" />
          <p className="text-xs font-semibold">В избранном пусто</p>
          <p className="text-[10px] text-slate-400 mt-1 px-4">
            Добавляйте маршруты в избранное с помощью сердечка на вкладке "Транспорт"
          </p>
        </div>
      );
    }
    return favoriteRoutes.map((route) => {
      const isSelected = selectedRoute && selectedRoute.id === route.id;
      return (
        <div
          key={route.id}
          onClick={() => handleSelectRoute(route)}
          className={`flex items-center gap-3 p-3.5 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] ${
            isSelected
              ? 'border-blue-500/50 bg-blue-50/20 dark:bg-blue-500/5'
              : 'border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/70'
          }`}
        >
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm"
            style={{ backgroundColor: route.color || '#2563EB' }}
          >
            #{route.number}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xs text-slate-850 dark:text-slate-100 truncate">
              {route.name || `Маршрут #${route.number}`}
            </h3>
            <p className="text-[10px] text-slate-450 dark:text-slate-400 mt-0.5">
              {route.type === 'minibus' ? 'Маршрутка' : 'Автобус'}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(route);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-red-500"
          >
            <Heart size={15} fill="#EF4444" className="text-red-500" />
          </button>
        </div>
      );
    });
  }

  if (activeTab === 'history') {
    if (!tripHistory.length) {
      return (
        <div className="text-center py-10 text-slate-450 dark:text-slate-500">
          <History size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
          <p className="text-xs">История поездок пуста</p>
        </div>
      );
    }
    return tripHistory.map((trip) => {
      const isSelected = selectedRoute && selectedRoute.id === trip.route_id;
      return (
        <div
          key={trip.id}
          onClick={() => {
            // Find full route object
            handleSelectRoute({
              id: trip.route_id,
              number: trip.route_number,
              name: trip.route_name,
              color: trip.route_color,
              type: trip.route_type,
            });
          }}
          className={`flex items-center gap-3 p-3.5 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/70 transition-all cursor-pointer active:scale-[0.98] ${
            isSelected ? 'border-blue-500/50 bg-blue-50/20 dark:bg-blue-500/5' : ''
          }`}
        >
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: trip.route_color || '#1565C0' }}
          >
            #{trip.route_number}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xs text-slate-850 dark:text-slate-100 truncate">
              {trip.route_name || `Маршрут #${trip.route_number}`}
            </h3>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              {trip.city_name || 'город'} • {trip.route_type === 'minibus' ? 'Маршрутка' : 'Автобус'}
            </p>
          </div>
          <span className="text-[9px] text-slate-400 font-medium">
            {new Date(trip.created_at).toLocaleDateString('ru', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      );
    });
  }

  return null;
}
