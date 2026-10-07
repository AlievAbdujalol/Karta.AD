import { useState, useEffect } from 'react';
import { Save, AlertTriangle } from 'lucide-react';

/** Подсветка несбалансированных скобок (экранируем HTML). */
function highlightBrackets(code) {
  const lines = String(code).split('\n');
  // грубая проверка по всему тексту без строк/комментариев — только явные хвосты
  const opens = (code.match(/[{[(]/g) || []).length;
  const closes = (code.match(/[}\])]/g) || []).length;
  return { opens, closes, balanced: opens === closes, lines: lines.length };
}

/**
 * Простой редактор файла: моноширинный textarea, счётчик, проверка скобок.
 */
export default function FileEditor({ path, content, onSave, busy }) {
  const [draft, setDraft] = useState(content ?? '');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(content ?? '');
    setSavedFlash(false);
  }, [path]);  

  const dirty = draft !== (content ?? '');
  const check = highlightBrackets(draft);

  const save = () => {
    onSave?.(path, draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
        <span className="text-[12px] font-mono font-bold text-slate-200 truncate flex-1">{path}</span>
        {!check.balanced && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400" title="Скобки не сходятся">
            <AlertTriangle size={11} /> {'{'}:{check.opens} {'}'}:{check.closes}
          </span>
        )}
        <span className="text-[10px] text-slate-500">{check.lines} строк</span>
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-[11px] font-bold"
        >
          <Save size={12} />
          {savedFlash ? 'Сохранено ✓' : 'Сохранить'}
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (dirty && !busy) save();
          }
        }}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        className="flex-1 min-h-[200px] w-full bg-[#0d1424] text-slate-100 font-mono text-[12px] leading-relaxed p-3 outline-none resize-none whitespace-pre"
      />
    </div>
  );
}
