  // ── Minimized button ──────────────────────────────────────────────────────

  if (minimized && hasResult) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-[88px] right-4 md:absolute md:bottom-auto md:top-[140px] md:right-4 z-[520] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 transition-all"
        title="Развернуть маршрут"
      >
        <Navigation size={22} />
      </button>
    );
  }

  // Hide while user picks a point on map
  if (picking) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="absolute left-2 right-2 md:left-auto md:right-3 z-[520] bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col overflow-hidden bottom-[calc(64px+env(safe-area-inset-bottom,0px)+8px)] max-h-[calc(100dvh-88px-1rem)] md:bottom-auto md:top-[136px] md:max-h-[calc(100dvh-160px)] md:w-[400px]"
      style={{ maxHeight: 'min(calc(100dvh - 96px), 680px)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-br from-blue-600/[0.06] to-transparent flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Navigation size={14} className="text-white" />
          </span>
          <div>
            <h2 className="text-[13px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
              Найти маршрут
            </h2>
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {selectedTransitOption
                ? `${fmtDist(selectedTransitOption.totalDistance)} · ${fmtDur(selectedTransitOption.totalDuration)}`
                : osrmRoute
                ? `${fmtDist(osrmRoute.distance)} · ${fmtDur(osrmRoute.duration)}`
                : 'Постройте маршрут'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasResult && (
            <button
              onClick={() => setMinimized(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              title="Свернуть"
            >
              <ChevronDown size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">

        {/* ── From / To ── */}
        <div className="relative">
          <div className="absolute left-[19px] top-[22px] bottom-[22px] w-0.5 bg-gradient-to-b from-emerald-500 via-slate-300 to-red-500 dark:via-slate-600 rounded-full opacity-50 pointer-events-none" />
          <button
            onClick={handleSwap}
            className="absolute left-[6px] top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow flex items-center justify-center hover:border-blue-400 hover:text-blue-600 active:scale-90 transition-all"
            title="Поменять местами"
          >
            <ArrowLeftRight size={12} className="text-slate-500 rotate-90" />
          </button>
          <div className="space-y-2.5">
            <PlaceField
              value={fromText}
              onChangeText={(v) => { setFromText(v); if (!v) setFrom(null); }}
              onPickPlace={(p) => { setFrom(p); setFromText(p.shortName); pushRecent(p); }}
              placeholder="Откуда — адрес или точка"
              iconColor="#22c55e"
              isActive={mapPickTarget === 'from'}
              onRequestMapPick={() => onRequestMapPick?.('from')}
              autoFocus={!from && !to}
            />
            <PlaceField
              value={toText}
              onChangeText={(v) => { setToText(v); if (!v) setTo(null); }}
              onPickPlace={(p) => { setTo(p); setToText(p.shortName); pushRecent(p); }}
              placeholder="Куда — цель маршрута"
              iconColor="#ef4444"
              isActive={mapPickTarget === 'to'}
              onRequestMapPick={() => onRequestMapPick?.('to')}
            />
          </div>
        </div>

        {/* ── Quick location buttons ── */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => fillWithMyLocation('from')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all"
          >
            <LocateFixed size={12} /> Моё место → Откуда
          </button>
          <button
            onClick={() => fillWithMyLocation('to')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <LocateFixed size={12} /> Моё место → Куда
          </button>
          {(from || to) && (
            <button
              onClick={() => {
                setFrom(null); setTo(null); setFromText(''); setToText('');
                setOsrmRoute(null); setTransitResults(null); setFallbackWalk(null);
                setError(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-500 hover:text-slate-700"
            >
              <RotateCw size={11} /> Сбросить
            </button>
          )}
        </div>

        {/* ── Transport modes ── */}
        <div>
          <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-2 flex items-center gap-1.5">
            <Route size={11} /> Чем едем
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {TRANSPORT_MODES.map((mode) => {
              const active = transportMode === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setTransportMode(mode.id)}
                  className={
                    'flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl border-2 transition-all ' +
                    (active
                      ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:text-slate-900 dark:border-white shadow-lg'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300')
                  }
                >
                  <Icon size={15} />
                  <span className="text-[10px] font-bold mt-1 leading-none">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>
