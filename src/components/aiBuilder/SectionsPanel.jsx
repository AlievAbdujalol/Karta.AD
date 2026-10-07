import { useState } from 'react';
import { Pencil, Trash2, Sparkles, ChevronDown, Plus, X, Check, ImagePlus, Loader2, Plug } from 'lucide-react';
import { SECTION_TYPES } from '@/lib/siteBuilder';
import { SITE_MODULES } from '@/lib/openrouter';
import { uploadSiteImage } from '@/lib/siteImages';
import { toast } from 'sonner';

/**
 * Панель секций: список, ручное редактирование полей, Ask AI по секции, удаление.
 * Preview-интроспекция невозможна (sandbox без same-origin) — выбор через список.
 */
export default function SectionsPanel({ sections, userId, imported = false, onModuleConnect, onUpdateSection, onDeleteSection, onAddSection, onAskAi, busy }) {
  const [openIdx, setOpenIdx] = useState(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTarget, setAiTarget] = useState(null);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePhoto = async (idx, file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadSiteImage(file, userId);
      onUpdateSection(idx, { image: url });
      toast.success('Фото добавлено');
    } catch (e) {
      toast.error(e.message || 'Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  };

  if (!sections) return null;

  return (
    <div className="bg-white dark:bg-slate-900 md:rounded-2xl border-0 md:border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-400 flex-1">
          {imported ? 'AI-модули' : `Edit section · ${sections.length}`}
        </span>
        {!imported && (
        <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 dark:text-violet-400">
          {adding ? <X size={12} /> : <Plus size={12} />} Блок
        </button>
        )}
      </div>
      {imported && (
        <div className="p-2.5 space-y-1.5">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Сайт загружен файлом — поля не трогаем, чтобы не затереть код. AI подключит модули сам:
          </p>
          {SITE_MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => onModuleConnect?.(m.id)}
              disabled={busy}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 text-[12px] font-bold text-violet-700 dark:text-violet-300 disabled:opacity-50 transition-colors text-left"
            >
              <Plug size={13} />
              <span className="flex-1">{m.icon} {m.label}</span>
            </button>
          ))}
        </div>
      )}

      {!imported && adding && (
        <div className="p-2 flex flex-wrap gap-1.5 border-b border-slate-100 dark:border-slate-800">
          {SECTION_TYPES.map((t) => (
            <button key={t} onClick={() => { onAddSection(t); setAdding(false); }}
              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-violet-100">
              + {t}
            </button>
          ))}
        </div>
      )}

      {!imported && (
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto scrollbar-ui">
        {sections.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-slate-400">Секций пока нет</p>
        )}
        {sections.map((s, i) => (
          <div key={i} className="px-3 py-2">
            <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center gap-2 text-left">
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 shrink-0">
                {s.type}
              </span>
              <span className="flex-1 min-w-0 text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate">
                {s.title || `Блок ${i + 1}`}
              </span>
              <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} />
            </button>

            {openIdx === i && (
              <div className="mt-2 space-y-1.5 pb-1">
                <input
                  value={s.title}
                  onChange={(e) => onUpdateSection(i, { title: e.target.value })}
                  placeholder="Title"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] text-slate-800 dark:text-slate-100"
                />
                <textarea
                  value={s.description}
                  onChange={(e) => onUpdateSection(i, { description: e.target.value })}
                  placeholder="Description"
                  rows={2}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[12px] text-slate-800 dark:text-slate-100"
                />
                {/* Фото секции */}
                <div className="flex items-center gap-2">
                  <input
                    id={`sec-photo-${i}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { handlePhoto(i, e.target.files?.[0]); e.target.value = ''; }}
                  />
                  {s.image ? (
                    <>
                      <img src={s.image} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                      <button onClick={() => onUpdateSection(i, { image: '' })}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                        <X size={11} /> Убрать
                      </button>
                    </>
                  ) : (
                    <label htmlFor={`sec-photo-${i}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-[11px] font-bold text-slate-500 dark:text-slate-400 cursor-pointer hover:border-violet-500 hover:text-violet-600">
                      {uploading && openIdx === i ? <Loader2 size={11} className="animate-spin" /> : <ImagePlus size={11} />}
                      Фото
                    </label>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => onDeleteSection(i)} disabled={busy}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50">
                    <Trash2 size={11} /> Удалить
                  </button>
                  <button onClick={() => { setAiTarget(aiTarget === i ? null : i); setAiPrompt(''); }}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10">
                    <Sparkles size={11} /> Ask AI
                  </button>
                </div>
                {aiTarget === i && (
                  <div className="flex gap-1.5">
                    <input
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { onAskAi(i, aiPrompt); setAiPrompt(''); setAiTarget(null); } }}
                      placeholder="Сделай этот блок современнее"
                      disabled={busy}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-transparent text-[12px] text-slate-800 dark:text-slate-100"
                    />
                    <button onClick={() => { onAskAi(i, aiPrompt); setAiPrompt(''); setAiTarget(null); }} disabled={busy || !aiPrompt.trim()}
                      className="px-2.5 rounded-lg bg-violet-600 text-white disabled:opacity-50">
                      <Check size={13} />
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Pencil size={9} /> Правки применяются и сохраняются новой версией
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
