        {/* ── Map pick banner ── */}
        {mapPickTarget && (
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 animate-pulse">
              <Crosshair size={14} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-amber-900 dark:text-amber-300">Выберите точку на карте</p>
              <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70">Переместите карту и нажмите ✓</p>
            </div>
            <button onClick={() => onRequestMapPick?.(null)} className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center">
              <X size={12} className="text-slate-500" />
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2.5 py-10">
            <Loader2 size={30} className="animate-spin text-blue-500" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {isTransit ? 'Ищем транспорт…' : 'Строим маршрут…'}
            </p>
            <p className="text-[11px] text-slate-400">Это займёт несколько секунд</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="flex gap-3 p-3.5 bg-red-50 dark:bg-red-500/10 rounded-2xl border border-red-200 dark:border-red-500/20">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-red-700 dark:text-red-400">{error}</p>
              <p className="text-[11px] text-red-600/70 dark:text-red-400/70 mt-1">
                Попробуйте изменить точки или другой режим.
              </p>
            </div>
          </div>
        )}

        {/* ── Transit results ── */}
        {!loading && isTransit && transitResults && allTransitOptions.length > 0 && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-widest uppercase text-slate-400">
                Найдено {allTransitOptions.length}{' '}
                {allTransitOptions.length === 1 ? 'вариант' : 'варианта'}
              </span>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Share2 size={12} />}
                {copied ? 'Скопировано' : 'Поделиться'}
              </button>
            </div>

            {/* Option cards */}
            <div className="space-y-2">
              {allTransitOptions.map((opt, idx) => (
                <TransitCard
                  key={idx}
                  option={opt}
                  isSelected={selectedTransitIdx === idx}
                  onSelect={() => handleSelectTransit(idx)}
                  vehicles={vehicles}
                />
              ))}
            </div>

            {/* Vehicle status for selected route */}
            {selectedTransitOption?.route && (
              <VehicleStatus vehicles={vehicles} routeId={selectedTransitOption.route.id} />
            )}

            {/* ETA detail */}
            {etaInfo && (
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                  <Bus size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-black text-emerald-800 dark:text-emerald-300">
                    Транспорт прибудет через ~{fmtDur(etaInfo.sec)}
                  </p>
                  <p className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70 mt-0.5 truncate">
                    На остановку «{boardStopForEta?.name || 'Остановка'}»
                  </p>
                </div>
                <span className="text-[13px] font-black text-emerald-700 dark:text-emerald-300 flex-shrink-0">
                  {new Date(Date.now() + etaInfo.sec * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            {/* Segment detail */}
            {selectedTransitOption && <SegmentSteps option={selectedTransitOption} />}

            {/* Route preview */}
            {selectedTransitOption && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5">
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  <Timer size={12} className="text-slate-400" />
                  <span>Выезд {nowTime}</span>
                  <span className="text-slate-300 dark:text-slate-600">→</span>
                  <span className="text-emerald-600 dark:text-emerald-400">Прибытие {arrivalTime}</span>
                </div>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleStartNavigation}
              className="w-full py-3.5 rounded-2xl font-black text-sm bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
            >
              <Play size={16} className="fill-white" />
              Поехать · {fmtDur(selectedTransitOption?.totalDuration || 0)} · {fmtDist(selectedTransitOption?.totalDistance || 0)}
            </button>

            {/* Voice + share */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navCtl?.toggleVoice?.()}
                className={
                  'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-colors ' +
                  (navCtl?.voiceEnabled
                    ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500')
                }
              >
                {navCtl?.voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                {navCtl?.voiceEnabled ? 'Озвучка вкл' : 'Без звука'}
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                {copied ? <Check size={13} className="text-emerald-500" /> : <Share2 size={13} />}
                Поделиться
              </button>
            </div>
          </div>
        )}

        {/* ── Fallback walking (transit mode, no transit found) ── */}
        {!loading && isTransit && fallbackWalk && !transitResults && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                Маршрут транспортом не найден — показан пешеходный
              </p>
            </div>
            <OsrmResultBlock
              route={fallbackWalk}
              mode="walking"
              fromText={fromText}
              toText={toText}
              nowTime={nowTime}
              arrivalTime={arrivalTime}
              onStart={handleStartNavigation}
              onShare={handleShare}
              copied={copied}
              navCtl={navCtl}
              showSteps={showSteps}
              onToggleSteps={() => setShowSteps((s) => !s)}
            />
          </div>
        )}

        {/* ── OSRM result (driving / walking / cycling / taxi) ── */}
        {!loading && !isTransit && osrmRoute && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            {transportMode === 'taxi' && from && to && (
              <button
                onClick={() => {
                  navigate('/taxi', {
                    state: {
                      trip: {
                        from: { name: fromText, lat: from.lat, lng: from.lng },
                        to:   { name: toText,   lat: to.lat,   lng: to.lng },
                      },
                    },
                  });
                  onClose?.();
                }}
                className="w-full py-3.5 rounded-2xl font-black text-sm bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                🚕 Заказать такси · {fmtDur(osrmRoute.duration)} · {fmtDist(osrmRoute.distance)}
              </button>
            )}
            <OsrmResultBlock
              route={osrmRoute}
              mode={transportMode}
              fromText={fromText}
              toText={toText}
              nowTime={nowTime}
              arrivalTime={arrivalTime}
              onStart={transportMode !== 'taxi' ? handleStartNavigation : undefined}
              onShare={handleShare}
              copied={copied}
              navCtl={navCtl}
              showSteps={showSteps}
              onToggleSteps={() => setShowSteps((s) => !s)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
