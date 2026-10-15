import { useEffect } from 'react';
import { X } from 'lucide-react';
import { getLegalDoc } from '@/lib/legalDocs';

/**
 * Модалка с полным правовым текстом (Пользовательское соглашение /
 * Условия использования) — открывается по названию документа на экране
 * регистрации: до входа в приложение охрана роутов рендерит Login
 * для всех путей, отдельный роут сюда не провести.
 */
export default function LegalDocModal({ docId, onClose }) {
  const doc = getLegalDoc(docId);

  useEffect(() => {
    if (!doc) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doc, onClose]);

  if (!doc) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h2 className="font-bold text-sm text-gray-900 dark:text-white">{doc.title}</h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">{s.heading}</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{s.text}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
