import { useState, useEffect, useCallback } from 'react';
import { Download, X, Share, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  initInstallPrompt, getInstallPrompt, canAutoInstall, onInstallPromptChange,
  isStandalone, isIOS, promptInstall,
} from '@/lib/installPrompt';

/**
 * Кнопка «Скачать приложение» (PWA).
 * Chrome/Edge/Android: сразу системный install-промпт. iOS и браузеры без
 * beforeinstallprompt: инструкция вручную — там API установки не существует.
 */
export default function InstallAppButton() {
  const [canInstall, setCanInstall] = useState(() => canAutoInstall());
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  // На всякий случай инициализируем и здесь: кнопка может отрендериться
  // раньше, чем отработал main.jsx (например, в тестах или при HMR).
  useEffect(() => {
    initInstallPrompt();
    setCanInstall(canAutoInstall());
    return onInstallPromptChange(() => {
      setCanInstall(canAutoInstall());
      if (getInstallPrompt() === null && isStandalone()) setInstalled(true);
    });
  }, []);

  const handleClick = useCallback(async () => {
    setBusy(true);
    try {
      const result = await promptInstall();
      if (result === 'accepted') {
        setInstalled(true);
        toast.success('Приложение установлено');
        return;
      }
      if (result === 'dismissed') {
        setCanInstall(false);
        return;
      }
      // Промпта нет (iOS, Firefox, уже отклонено) — показываем инструкцию.
      setShowHelp((v) => !v);
    } finally {
      setBusy(false);
    }
  }, []);

  if (installed) {
    return (
      <div className="w-full rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0" />
        <p className="text-[13px] font-bold text-emerald-800 dark:text-emerald-200">Приложение установлено</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        disabled={busy}
        className="w-full rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-70 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all px-4 py-3 flex items-center gap-3 text-left"
      >
        <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Download size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-extrabold leading-tight">Скачать приложение</span>
          <span className="block text-[11px] font-medium opacity-80 mt-0.5">
            {canInstall ? 'Нажмите — установится сразу' : 'Бесплатно · работает без интернета'}
          </span>
        </span>
      </button>

      {showHelp && !canInstall && (
        <div className="mt-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Share size={13} /> Как установить
            </p>
            <button onClick={() => setShowHelp(false)} className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500">
              <X size={12} />
            </button>
          </div>
          {isIOS() ? (
            <ol className="text-[12px] text-slate-600 dark:text-slate-300 space-y-1 list-decimal list-inside leading-snug">
              <li>Нажми «Поделиться» в Safari</li>
              <li>Выбери «На экран „Домой“»</li>
              <li>Нажми «Добавить»</li>
            </ol>
          ) : (
            <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-snug">
              Открой меню браузера (⋮) и выбери «Установить приложение» или «Добавить на главный экран».
            </p>
          )}
        </div>
      )}
    </div>
  );
}
