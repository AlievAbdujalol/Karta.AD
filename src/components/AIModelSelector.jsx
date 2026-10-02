import { useState, useMemo } from 'react';
import { ChevronDown, Search, RefreshCw, Check, Cpu, Eye, Code2, Brain, AlignLeft } from 'lucide-react';
import { providerOf, shortName, capabilitiesOf, filterModels } from '@/lib/aiModels';

const FILTERS = [
  { id: 'all', label: 'Все', icon: AlignLeft },
  { id: 'text', label: 'Текст', icon: AlignLeft },
  { id: 'vision', label: 'Vision', icon: Eye },
  { id: 'coding', label: 'Код', icon: Code2 },
  { id: 'reasoning', label: 'Reasoning', icon: Brain },
];

function fmtContext(n) {
  const v = Number(n || 0);
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v || '—');
}

/**
 * Селектор бесплатной OpenRouter-модели: поиск, фильтры, refresh, состояния.
 * Props: models, loading, error, updatedAt, value, onChange, onRefresh, compact?
 */
export default function AIModelSelector({
  models = [], loading = false, error = null, updatedAt = null,
  value = '', onChange, onRefresh,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cap, setCap] = useState('all');

  const filtered = useMemo(() => filterModels(models, { q, capability: cap }), [models, q, cap]);
  const selected = models.find((m) => m.id === value) || null;

  const updatedStr = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="w-full relative">
      {/* Триггер */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-left hover:border-violet-400 transition-colors"
      >
        <Cpu size={15} className="text-violet-500 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate">
            {selected ? shortName(selected) : 'Выбери бесплатную модель'}
          </span>
          <span className="block text-[10px] text-slate-400 truncate">
            {selected ? `${providerOf(selected.id)} · Free` : `${models.length} free models available`}
          </span>
        </span>
        <ChevronDown size={15} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col max-h-[46vh]">
          {/* Поиск */}
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="🔍 Search free models..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[13px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none"
              />
            </div>
            <div className="flex gap-1.5 mt-2 overflow-x-auto">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCap(f.id)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                    cap === f.id
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <f.icon size={11} />
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Список */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <p className="px-4 py-6 text-center text-[13px] text-slate-400">Loading free models…</p>
            )}
            {!loading && error && (
              <div className="px-4 py-6 text-center space-y-2">
                <p className="text-[13px] text-red-500 font-semibold">Unable to load free models.</p>
                <button onClick={onRefresh} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div className="px-4 py-6 text-center space-y-2">
                <p className="text-[13px] text-slate-400">No free models are currently available.</p>
                <button onClick={onRefresh} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
                  Refresh
                </button>
              </div>
            )}
            {!loading && !error && filtered.map((m) => {
              const caps = capabilitiesOf(m);
              const active = m.id === value;
              return (
                <button
                  key={m.id}
                  onClick={() => { onChange?.(m.id); setOpen(false); }}
                  className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${active ? 'bg-violet-50 dark:bg-violet-500/10' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px]" title="Free">🟢</span>
                    <span className="flex-1 min-w-0 text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate">
                      {shortName(m)}
                    </span>
                    {active && <Check size={14} className="text-violet-600 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 ml-6 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-400 truncate">{m.id}</span>
                    <span className="text-[10px] font-bold text-slate-500">{providerOf(m.id)}</span>
                    <span className="text-[10px] font-bold px-1.5 py-px rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">Free</span>
                    {!!m.context_length && (
                      <span className="text-[10px] text-slate-400">{fmtContext(m.context_length)} ctx</span>
                    )}
                    {caps.vision && <span className="text-[10px] text-slate-400">vision</span>}
                    {caps.coding && <span className="text-[10px] text-slate-400">code</span>}
                    {caps.reasoning && <span className="text-[10px] text-slate-400">reasoning</span>}
                  </div>
                  {!!m.description && (
                    <p className="text-[11px] text-slate-400 mt-0.5 ml-6 line-clamp-2 leading-snug">{m.description}</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Футер */}
          <div className="flex items-center justify-between px-3.5 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
            <span className="text-[10px] text-slate-400">
              {models.length} free models available · Last updated: {updatedStr}
            </span>
            <button onClick={onRefresh} title="Refresh models"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
