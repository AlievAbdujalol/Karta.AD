import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, BellOff, CheckCheck, Loader2, Check, Ban } from 'lucide-react';
import { useNotificationCount } from '@/lib/NotificationContext';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';

export default function NotificationPanel({ notifications, onClear }) {
  const { t } = useLanguage();
  const { confirmPayment, rejectPayment, markAsRead } = useNotificationCount();
  const [open, setOpen] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const [processingId, setProcessingId] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const unread = notifications.length - readCount;

  const handleOpen = () => {
    if (!open && btnRef.current) {
      // Вычисляем позицию относительно кнопки
      const rect = btnRef.current.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(o => !o);
    if (!open) setReadCount(notifications.length);
  };

  // Закрыть при клике вне панели
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!panelRef.current || !btnRef.current) return;
      const panelRect = panelRef.current.getBoundingClientRect();
      const isInsidePanel =
        e.clientX >= panelRect.left &&
        e.clientX <= panelRect.right &&
        e.clientY >= panelRect.top &&
        e.clientY <= panelRect.bottom;
      const btnRect = btnRef.current.getBoundingClientRect();
      const isInsideBtn =
        e.clientX >= btnRect.left &&
        e.clientX <= btnRect.right &&
        e.clientY >= btnRect.top &&
        e.clientY <= btnRect.bottom;
      if (!isInsidePanel && !isInsideBtn) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Отмечаем как прочитанные при открытии
  useEffect(() => {
    if (open) setReadCount(notifications.length);
  }, [notifications.length, open]);

  // Закрываем при скролле или resize снаружи
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      // Игнорируем скролл внутри панели (скролл списка уведомлений)
      if (e?.target?.nodeType === 1 && panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const handleConfirm = async (n) => {
    const txId = n.data?.transaction_id;
    if (!txId) return;
    setProcessingId(n.id);
    try {
      await confirmPayment(txId);
      toast.success(t('notifications.paymentConfirmed'));
    } catch (err) {
      toast.error(err.message || t('notifications.paymentConfirmError'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (n) => {
    const txId = n.data?.transaction_id;
    if (!txId) return;
    setProcessingId(n.id);
    try {
      await rejectPayment(txId);
      toast.success(t('notifications.paymentRejected'));
    } catch (err) {
      toast.error(err.message || t('notifications.paymentRejectError'));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      {/* Кнопка колокольчика */}
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="relative w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors bg-white/15 dark:bg-white/10 border border-white/20 dark:border-white/15"
      >
        <Bell size={18} className="text-white" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Панель рендерится прямо в body — поверх всего */}
      {open && createPortal(
        <>
          <style>{`
            .notification-scroll { scrollbar-width: auto; }
            .notification-scroll::-webkit-scrollbar { width: 8px; }
            .notification-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
            .notification-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; border: 2px solid #f1f5f9; }
            .notification-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
          `}</style>
          <div
            ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos.top,
            right: panelPos.right,
            width: 'min(320px, calc(100vw - 32px))',
            zIndex: 99999,
            borderRadius: 16,
            background: 'white',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            border: '1px solid rgba(0,0,0,0.07)',
            overflow: 'hidden',
          }}
        >
          {/* Заголовок */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-blue-600" />
              <span className="font-semibold text-sm text-gray-800">{t('notifications.title')}</span>
              {notifications.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {notifications.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={() => { onClear(); setReadCount(0); }}
                  className="text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-1"
                >
                  <CheckCheck size={12} />
                  {t('notifications.clearAll')}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Список */}
          <div style={{
            maxHeight: 'min(400px, calc(100vh - 280px))',
            overflowY: 'scroll',
          }} className="notification-scroll">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <BellOff size={28} className="mb-2 opacity-40" />
                <p className="text-xs">{t('notifications.empty')}</p>
                <p className="text-[10px] mt-1 text-gray-300">{t('notifications.emptyHint')}</p>
              </div>
            ) : (
              notifications.slice().reverse().map((n) => {
                const isPendingPayment = n.type === 'payment_pending';
                const isDismissible = !isPendingPayment;
                const isProcessing = processingId === n.id;
                
                const handleClick = () => {
                  if (isDismissible && !isProcessing) {
                    markAsRead(n.id);
                  }
                };
                
                return (
                  <div
                    key={n.id}
                    onClick={handleClick}
                    className={`px-4 py-3 border-b border-gray-50 last:border-0 ${
                      isDismissible ? 'cursor-pointer hover:bg-gray-50' : ''
                    } ${
                      isPendingPayment 
                        ? 'bg-blue-50/70 border-l-4 border-l-blue-500' 
                        : n.type === 'delay' 
                          ? 'bg-amber-50' 
                          : 'bg-blue-50/40'
                    }`}
                  >
                    <p className="text-xs font-semibold text-gray-800">{n.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{n.body}</p>
                    
                    {isPendingPayment && (
                      <div className="flex gap-2 mt-2">
                        <button
                          disabled={isProcessing}
                          onClick={(e) => { e.stopPropagation(); handleConfirm(n); }}
                          className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-3 py-2 min-h-[36px] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                          {t('notifications.confirmButton')}
                        </button>
                        <button
                          disabled={isProcessing}
                          onClick={(e) => { e.stopPropagation(); handleReject(n); }}
                          className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-3 py-2 min-h-[36px] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Ban size={10} />
                          {t('notifications.rejectButton')}
                        </button>
                      </div>
                    )}
                    
                    <p className="text-[10px] text-gray-300 mt-1">
                      {new Date(n.created_at || n.id).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </>,
        document.body
      )}
    </>
  );
}
