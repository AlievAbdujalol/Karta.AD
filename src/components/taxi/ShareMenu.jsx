import { MessageCircle, Send, Copy, Share2, X } from 'lucide-react';
import { toast } from 'sonner';

const SERVICES = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    color: 'bg-green-500 hover:bg-green-600',
    buildUrl: (text) => `https://wa.me/?text=${encodeURIComponent(text)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: Send,
    color: 'bg-blue-500 hover:bg-blue-600',
    buildUrl: (text) => `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: Share2,
    color: 'bg-gradient-to-br from-purple-500 to-pink-500 hover:opacity-90',
    buildUrl: (text) => `https://www.instagram.com/`,
  },
];

export default function ShareMenu({ open, onClose, text }) {
  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      toast.success('Скопировано');
      onClose();
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const handleNativeShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Поездка Karta.AD', text });
      else await navigator.clipboard?.writeText(text);
      onClose();
    } catch {}
  };

  const handleService = (service) => {
    if (service.id === 'instagram') {
      navigator.clipboard?.writeText(text);
      toast.success('Текст скопирован — вставьте в Instagram');
      onClose();
      return;
    }
    window.open(service.buildUrl(text), '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl w-full max-w-lg p-5 pb-24 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Поделиться поездкой</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => handleService(s)}
                className={`flex flex-col items-center gap-2 py-3 rounded-2xl text-white text-[11px] font-bold transition-all ${s.color} active:scale-95`}
              >
                <Icon size={20} />
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
          >
            <Copy size={14} /> Копировать
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              onClick={handleNativeShare}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-xs font-bold text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <Share2 size={14} /> Ещё...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
