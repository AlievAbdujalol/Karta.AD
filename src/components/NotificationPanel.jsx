import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, BellOff, CheckCheck, Loader2, Check, Ban } from 'lucide-react';
import { useNotificationCount } from '@/lib/NotificationContext';
import { toast } from 'sonner';

export default function NotificationPanel({ notifications, onClear }) {
  const { confirmPayment, rejectPayment } = useNotificationCount();
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
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Отмечаем как прочитанные при открытии
  useEffect(() => {
    if (open) setReadCount(notifications.length);
  }, [notifications.length, open]);

  // Закрываем при скролле или resize
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
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
      toast.success('Оплата успешно подтверждена');
    } catch (err) {
      toast.error(err.message || 'Ошибка подтверждения оплаты');
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
      toast.success('Оплата отклонена');
    } catch (err) {
      toast.error(err.message || 'Ошибка отклонения оплаты');
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
        className="relative w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors"
        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
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
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos.top,
            right: panelPos.right,
            width: 320,
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
              <span className="font-semibold text-sm text-gray-800">Уведомления</span>
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
                  Очистить
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Список */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <BellOff size={28} className="mb-2 opacity-40" />
                <p className="text-xs">Нет уведомлений</p>
                <p className="text-[10px] mt-1 text-gray-300">Выберите маршрут и остановку для слежения</p>
              </div>
            ) : (
              notifications.slice().reverse().map((n) => {
                const isPendingPayment = n.type === 'payment_pending';
                const isProcessing = processingId === n.id;
                
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-gray-50 last:border-0 ${
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
                          onClick={() => handleConfirm(n)}
                          className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                          Подтвердить
                        </button>
                        <button
                          disabled={isProcessing}
                          onClick={() => handleReject(n)}
                          className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Ban size={10} />
                          Отклонить
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
        </div>,
        document.body
      )}
    </>
  );
}
