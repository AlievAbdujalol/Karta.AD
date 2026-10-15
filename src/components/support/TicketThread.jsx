import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, ArrowLeft, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';
import { statusChipClass, statusI18nKey, TICKET_LIMITS, PHOTO_LIMITS, SIGNED_URL_TTL_SECONDS } from '@/lib/supportConfig';
import { arePhotosSettled, signedPhotoUrl } from '@/lib/photoUpload';
import {
  fetchTicketMessages,
  fetchTicketPhotos,
  replyToTicket,
  markTicketRead,
  newClientMsgId,
  removeStoragePhoto,
  subscribe,
  unsubscribe,
} from '@/lib/supportApi';
import PhotoPicker from './PhotoPicker';

/**
 * Переписка по обращению. Режим user — автор; режим dev — разработчик
 * (тип сообщения всё равно решает сервер по support_developers).
 * Повтор отправки при сбое использует ТОТ ЖЕ client_msg_id — дубля не будет.
 */
export default function TicketThread({ ticket, userId, mode = 'user', onBack, onChanged }) {
  const { t, lang } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [text, setText] = useState('');
  const [picked, setPicked] = useState([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const clientMsgIdRef = useRef(null);
  const pickedRef = useRef([]);
  const loadSeqRef = useRef(0);
  const bottomRef = useRef(null);

  const isUser = mode === 'user';
  const closed = ticket.status === 'closed';

  const handlePickedChange = next => {
    pickedRef.current = next;
    setPicked(next);
  };

  // Загрузка с защитой от гонки: ответ устаревшей задачи не перетирает новые данные.
  const load = async () => {
    const seq = ++loadSeqRef.current;
    try {
      const [msgs, phs] = await Promise.all([
        fetchTicketMessages(ticket.id),
        fetchTicketPhotos(ticket.id),
      ]);
      if (seq !== loadSeqRef.current) return;
      setMessages(msgs);
      setPhotos(phs);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      toast.error(err.message);
    }
    if (seq === loadSeqRef.current) setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    clientMsgIdRef.current = null;
    setText('');
    handlePickedChange([]);
    load();
    if (isUser) {
      markTicketRead(ticket.id).then(() => onChanged?.()).catch(() => {});
    }
    return () => {
      // Приготовленные, но не отправленные фото не должны остаться в bucket.
      for (const p of pickedRef.current) {
        if (p.path) removeStoragePhoto(PHOTO_LIMITS.buckets.support, p.path);
      }
      pickedRef.current = [];
    };
  }, [ticket.id]);

  // Realtime: новое сообщение — перечитываем ветку целиком (фолбэк — load() выше).
  useEffect(() => {
    const channel = subscribe(
      'support_messages',
      payload => {
        if (payload.new?.ticket_id !== ticket.id) return;
        load();
        if (isUser) markTicketRead(ticket.id).catch(() => {});
      },
      `ticket_id=eq.${ticket.id}`
    );
    return () => unsubscribe(channel);
  }, [ticket.id, isUser]);

  // Подписанные ссылки на приватные фото обращения.
  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        photos.map(async p => [p.storage_path, await signedPhotoUrl(p.storage_path, SIGNED_URL_TTL_SECONDS)])
      );
      if (!alive) return;
      setSignedUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    })();
    return () => {
      alive = false;
    };
  }, [photos]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length]);

  // Фото, прикреплённые к созданию обращения (message_id NULL) — к первому сообщению.
  const photosByMessage = useMemo(() => {
    const map = {};
    const firstId = messages[0]?.id;
    for (const p of photos) {
      const key = p.message_id || firstId;
      if (!key) continue;
      (map[key] = map[key] || []).push(p);
    }
    return map;
  }, [photos, messages]);

  const photosReady = arePhotosSettled(picked);

  const send = async () => {
    if (sending) return;
    const body = text.trim();
    if (body.length < TICKET_LIMITS.replyMin || body.length > TICKET_LIMITS.replyMax) {
      return toast.error(t('support.replyInvalid'));
    }
    if (!photosReady) return toast.error(t('support.photoPending'));
    if (!clientMsgIdRef.current) clientMsgIdRef.current = newClientMsgId();

    setSending(true);
    try {
      await replyToTicket(ticket.id, body, picked, clientMsgIdRef.current);
      clientMsgIdRef.current = null; // отправлено — следующий ответ получит новый id
      setText('');
      handlePickedChange([]); // фото привязаны к сообщению — сирот не будет
      await load();
      onChanged?.();
    } catch (err) {
      // client_msg_id сохранён — повтор не создаст дубликат
      toast.error(err.message);
    }
    setSending(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[20px] border border-slate-100 dark:border-slate-800/50 shadow-sm flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/70 dark:bg-slate-900">
        {onBack && (
          <button
            type="button"
            aria-label={t('support.back')}
            onClick={onBack}
            className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 flex items-center justify-center"
          >
            <ArrowLeft size={14} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
            #{ticket.ticket_number} · {ticket.subject}
          </p>
          <p className="text-[10px] text-slate-400">{ticket.category && t(`support.category.${ticket.category}`)}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border ${statusChipClass(ticket.status)}`}>
          {t(statusI18nKey(ticket.status))}
        </span>
      </div>

      <div className="p-4 space-y-3 max-h-[45vh] overflow-y-auto" data-testid="thread-messages">
        {loading && (
          <div className="text-center py-6 text-slate-400">
            <Loader2 size={22} className="mx-auto animate-spin opacity-40" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">{t('support.noMessages')}</p>
        )}
        {messages.map(msg => {
          const isDevMsg = msg.message_type === 'developer';
          const mine = msg.sender_id === userId;
          return (
            <div key={msg.id} className={`flex ${mine && !isDevMsg ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs whitespace-pre-line ${
                  isDevMsg
                    ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-slate-700 dark:text-slate-200'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
              >
                {isDevMsg && (
                  <span className="block text-[10px] font-black text-blue-600 dark:text-blue-300 mb-1">
                    {t('support.devBadge')}
                  </span>
                )}
                <span data-testid={`message-${msg.id}`}>{msg.body}</span>
                {(photosByMessage[msg.id] || []).length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {photosByMessage[msg.id]
                      .filter(p => signedUrls[p.storage_path])
                      .map(p => (
                        <img
                          key={p.id}
                          src={signedUrls[p.storage_path]}
                          alt={ticket.subject}
                          loading="lazy"
                          className="w-full h-24 object-cover rounded-lg border border-slate-200/60 dark:border-slate-700"
                        />
                      ))}
                  </div>
                )}
                <div className="text-[9px] text-slate-400 mt-1 text-right">
                  {new Date(msg.created_at).toLocaleString(lang)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {isUser && closed ? (
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/50 flex items-center gap-2 text-[11px] text-slate-400">
          <Lock size={13} />
          {t('support.ticketClosed')}
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/50 space-y-3">
          <PhotoPicker
            bucket={PHOTO_LIMITS.buckets.support}
            userId={userId}
            value={picked}
            onChange={handlePickedChange}
            maxCount={PHOTO_LIMITS.maxCount}
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={TICKET_LIMITS.replyMax}
              placeholder={t('support.replyPlaceholder')}
              onKeyDown={e => e.key === 'Enter' && send()}
              className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              aria-label={t('support.replySend')}
              onClick={send}
              disabled={sending || !photosReady || text.trim().length === 0}
              className="px-3.5 rounded-xl bg-blue-600 text-white disabled:opacity-50 flex items-center justify-center"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
