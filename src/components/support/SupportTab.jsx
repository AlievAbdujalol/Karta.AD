import { useEffect, useRef, useState } from 'react';
import { Plus, MessageSquare, ChevronRight, Inbox, Loader2, Send, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';
import {
  TICKET_CATEGORIES,
  TICKET_LIMITS,
  PHOTO_LIMITS,
  statusChipClass,
  statusI18nKey,
  ticketCategoryI18nKey,
} from '@/lib/supportConfig';
import { arePhotosSettled } from '@/lib/photoUpload';
import {
  fetchMyTickets,
  fetchUnreadDevMessages,
  createTicket,
  newClientMsgId,
  subscribe,
  unsubscribe,
} from '@/lib/supportApi';
import PhotoPicker from './PhotoPicker';
import TicketThread from './TicketThread';

function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
      {count}
    </span>
  );
}

/** Новое обращение: тема, категория, описание, фото. Идемпотентно по client_msg_id. */
function NewTicketForm({ userId, onCreated, onCancel }) {
  const { t } = useLanguage();
  const [category, setCategory] = useState(TICKET_CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const clientMsgIdRef = useRef(null);

  const photosReady = arePhotosSettled(photos);

  const handleSubmit = async () => {
    if (submitting) return;
    const s = subject.trim();
    const b = body.trim();
    if (s.length < TICKET_LIMITS.subjectMin || s.length > TICKET_LIMITS.subjectMax) {
      return toast.error(t('support.subjectInvalid'));
    }
    if (b.length < TICKET_LIMITS.bodyMin || b.length > TICKET_LIMITS.bodyMax) {
      return toast.error(t('support.bodyInvalid'));
    }
    if (!photosReady) return toast.error(t('support.photoPending'));

    setSubmitting(true);
    if (!clientMsgIdRef.current) clientMsgIdRef.current = newClientMsgId();
    try {
      const res = await createTicket({
        subject: s,
        category,
        body: b,
        photos,
        clientMsgId: clientMsgIdRef.current,
      });
      clientMsgIdRef.current = null;
      toast.success(t('support.created'));
      onCreated?.({ ...res, subject: s, category });
      onCancel?.();
    } catch (err) {
      // client_msg_id сохранён для повтора — дубликата не будет
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[20px] p-5 shadow-sm border border-slate-100 dark:border-slate-800/50 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">{t('support.newTicket')}</h2>
        <button
          type="button"
          aria-label={t('support.close')}
          onClick={onCancel}
          className="text-xs font-bold text-slate-400 hover:text-slate-600"
        >
          {t('support.close')}
        </button>
      </div>

      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
          {t('support.categoryLabel')}
        </label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs bg-slate-50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors"
        >
          {TICKET_CATEGORIES.map(c => (
            <option key={c} value={c}>{t(ticketCategoryI18nKey(c))}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
          {t('support.subjectLabel')}
        </label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          maxLength={TICKET_LIMITS.subjectMax}
          placeholder={t('support.subjectPlaceholder')}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs bg-slate-50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
          {t('support.bodyLabel')}
        </label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={5}
          maxLength={TICKET_LIMITS.bodyMax}
          placeholder={t('support.bodyPlaceholder')}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs resize-none bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      <PhotoPicker
        bucket={PHOTO_LIMITS.buckets.support}
        userId={userId}
        value={photos}
        onChange={setPhotos}
        maxCount={PHOTO_LIMITS.maxCount}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !photosReady}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-sm shadow-blue-500/10"
      >
        {submitting ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Send size={15} />
        )}
        <span className="text-xs">{t('support.sendTicket')}</span>
      </button>
    </div>
  );
}

/** Личные обращения пользователя: список, создание, переписка. */
export default function SupportTab({ userId }) {
  const { t } = useLanguage();
  const [tickets, setTickets] = useState([]);
  const [unread, setUnread] = useState({});
  const [view, setView] = useState('list'); // list | new | thread
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, unreadRows] = await Promise.all([
          fetchMyTickets(),
          // RLS вернёт непрочитанные ответы только по моим обращениям
          fetchUnreadDevMessages(),
        ]);
        if (!alive) return;
        setTickets(list);
        setUnread(unreadRows);
        setFailed(false);
        // Открытая ветка подтягивает свежий статус/дату из перезагруженного списка.
        setActive(prev => {
          if (!prev) return prev;
          const fresh = list.find(x => x.id === prev.id);
          return fresh ? { ...prev, ...fresh } : prev;
        });
      } catch (err) {
        console.error('[SupportTab] load:', err.message);
        if (alive) setFailed(true);
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Realtime по своим обращениям (статусы/обновления); без неё — reloadKey.
  useEffect(() => {
    const channel = subscribe(
      'support_tickets',
      payload => {
        if (payload.new?.user_id === userId) setReloadKey(k => k + 1);
      },
      `user_id=eq.${userId}`
    );
    return () => unsubscribe(channel);
  }, [userId]);

  const bump = () => setReloadKey(k => k + 1);

  const openTicket = async ticket => {
    setActive(ticket);
    setView('thread');
    try {
      setUnread(await fetchUnreadDevMessages());
    } catch {
      /* индикатор не критичен */
    }
  };

  const handleMessageChanged = () => {
    fetchUnreadDevMessages().then(setUnread).catch(() => {});
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <RefreshCw size={28} className="mx-auto mb-3 animate-spin opacity-40" />
      </div>
    );
  }

  if (view === 'thread' && active) {
    return (
      <TicketThread
        ticket={active}
        userId={userId}
        mode="user"
        onBack={() => {
          setView('list');
          setActive(null);
          bump();
        }}
        onChanged={handleMessageChanged}
      />
    );
  }

  if (view === 'new') {
    return (
      <NewTicketForm
        userId={userId}
        onCancel={() => setView('list')}
        onCreated={res => {
          bump();
          if (res?.id) openTicket(res);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {failed && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-600 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{t('support.feedError')}</span>
          <button type="button" onClick={bump} className="font-bold underline">
            {t('support.reload')}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setView('new')}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-xs transition-all shadow-sm shadow-blue-500/10"
      >
        <Plus size={15} />
        {t('support.newTicket')}
      </button>

      {tickets.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <Inbox size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-xs">{t('support.noTickets')}</p>
        </div>
      ) : (
        tickets.map(ticket => (
          <button
            key={ticket.id}
            type="button"
            onClick={() => openTicket(ticket)}
            className="w-full text-left bg-white dark:bg-slate-800 rounded-[20px] p-4 shadow-sm border border-slate-100 dark:border-slate-700/60 hover:shadow-md transition-shadow flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
              <MessageSquare size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                  #{ticket.ticket_number} {ticket.subject}
                </span>
                <UnreadBadge count={unread[ticket.id] || 0} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${statusChipClass(ticket.status)}`}>
                  {t(statusI18nKey(ticket.status))}
                </span>
                <span className="text-[10px] text-slate-400">
                  {t(ticketCategoryI18nKey(ticket.category))}
                </span>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </button>
        ))
      )}
    </div>
  );
}
