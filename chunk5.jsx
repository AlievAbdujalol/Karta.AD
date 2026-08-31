// ---------------------------------------------------------------------------
// Sub-component: OsrmStepsList
// ---------------------------------------------------------------------------

function OsrmStepsList({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border-b">
        <span className="text-[11px] font-black tracking-widest uppercase text-slate-600">Пошагово</span>
      </div>
      <div className="max-h-[200px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {steps.slice(0, 30).map((step, i) => (
          <div key={i} className="flex gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <span className={
              "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5 " +
              (i === 0 ? "bg-emerald-500 text-white" : i === steps.length - 1 ? "bg-red-500 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600")
            }>
              {i === 0 ? "A" : i === steps.length - 1 ? "B" : i}
            </span>
            <div className="flex-1 min-w-0 py-0.5">
              <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                {step.name || (step.instruction === "depart" ? "Начало движения" : step.instruction === "arrive" ? "Вы прибыли" : "Движение")}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{fmtDist(step.distance)} · {fmtDur(step.duration)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
