import { useState, useEffect, useCallback } from 'react';
import { Download, X, Share, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

function isInstalled() {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone === true) return true; // iOS
  } catch {}
  return false;
}

function isIOS() {
  try {
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch { return false; }
}

/**
 * Кнопка «Установить приложение» (PWA).
 * Chrome/Edge: системный install-промпт. iOS/другие: инструкция вручную.
 */
export default function InstallAppButton() {
  const [deferred, setDeferred] = useState(() => window.__kartaInstallPrompt || null);
  const [installed, setInstalled] = useState(() => isInstalled());
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      window.__kartaInstallPrompt = e;
      setDeferred(e);
    };
    const onInstalled = () => {
      window.__kartaInstallPrompt = null;
      setDeferred(null);
      setInstalled(true);
      toast.success('Приложение установлено');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleClick = useCallback(async () => {
    const p = window.__kartaInstallPrompt;
    if (p) {
      try {
        await p.prompt();
        const { outcome } = await p.userChoice;
        if (outcome === 'accepted') {
          window.__kartaInstallPrompt = null;
          setDeferred(null);
          return;
        }
      } catch {}
      return;
    }
    // Промпта нет (iOS, Firefox, уже отклонено) — показываем инструкцию.
    setShowHelp((v) => !v);
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
        className="w-full rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all px-4 py-3 flex items-center gap-3 text-left"
      >
        <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Download size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-extrabold leading-tight">Скачать приложение</span>
          <span className="block text-[11px] font-medium opacity-80 mt-0.5">
            {deferred ? 'Установка в один тап' : 'Бесплатно · работает без интернета'}
          </span>
        </span>
      </button>

      {showHelp && !deferred && (
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
