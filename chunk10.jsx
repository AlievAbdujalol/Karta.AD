// ---------------------------------------------------------------------------
// Sub-component: OsrmResultBlock
// ---------------------------------------------------------------------------

function OsrmResultBlock({ route, mode, fromText, toText, nowTime, arrivalTime, onStart, onShare, copied, navCtl, showSteps, onToggleSteps }) {
  const modeMeta = TRANSPORT_MODES.find((m) => m.id === mode);

  const estimateCost = (dist, m) => {
    const km = dist / 1000;
    if (m === 'driving') return Math.round(km * 1.8 + 8);
    if (m === 'taxi')    return Math.round(km * 5 + 25);
    return 0;
  };

  const cost = estimateCost(route.distance, mode);

  return (
    <div className="space-y-3">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Расстояние', value: fmtDist(route.distance),                                         Icon: Route },
          { label: 'Время',      value: fmtDur(route.duration),                                           Icon: Clock3 },
          { label: 'Стоимость',  value: cost > 0 ? `${cost} TJS` : 'Бесплатно',                           Icon: Copy  },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="p-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center">
            <Icon size={14} className="mx-auto mb-1 text-slate-400" />
            <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">{label}</p>
            <p className="text-[13px] font-black mt-0.5 text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Route preview A → B */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5">
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
            <span className="w-0.5 flex-1 min-h-[28px] bg-gradient-to-b from-emerald-500 via-slate-300 to-red-500 dark:via-slate-600 rounded-full" />
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-[10px] font-black tracking-widest uppercase text-emerald-600 dark:text-emerald-400">Откуда</p>
              <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{fromText || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-black tracking-widest uppercase text-red-500">Куда</p>
              <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{toText || '—'}</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700 pt-2.5">
              <Timer size={12} className="text-slate-400" />
              <span>Выезд {nowTime}</span>
              <span className="text-slate-300 dark:text-slate-600">→</span>
              <span className="text-emerald-600 dark:text-emerald-400">Прибытие {arrivalTime}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      {onStart && (
        <div className="space-y-2">
          <button
            onClick={onStart}
            className="w-full relative overflow-hidden rounded-2xl text-white shadow-xl active:scale-[0.98] transition-all p-1 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/25"
          >
            <span className="flex items-center gap-3 px-4 py-3">
              <span className="w-11 h-11 rounded-xl bg-white text-emerald-600 flex items-center justify-center shadow flex-shrink-0">
                <Play size={20} className="fill-emerald-600 ml-0.5" />
              </span>
              <span className="flex-1 text-left">
                <span className="block text-[15px] font-black leading-none">Поехать</span>
                <span className="block text-[11px] font-bold opacity-90 mt-0.5">
                  {modeMeta?.label || mode} · {fmtDur(route.duration)} · {fmtDist(route.distance)}
                  {cost > 0 ? ` · ~${cost} TJS` : ''}
                </span>
              </span>
            </span>
          </button>

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
              onClick={onShare}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Share2 size={13} />}
              Поделиться
            </button>
          </div>
        </div>
      )}

      {/* Steps toggle */}
      {route.steps?.length > 0 && (
        <>
          <button
            onClick={onToggleSteps}
            className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 hover:bg-slate-50"
          >
            <Route size={12} />
            {showSteps ? 'Скрыть шаги' : `Показать пошаговый маршрут (${route.steps.length})`}
          </button>
          {showSteps && <OsrmStepsList steps={route.steps} />}
        </>
      )}
    </div>
  );
}