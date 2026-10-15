import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ArrowLeft, RefreshCw, StickyNote, UserCheck, UserMinus, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';
import {
  STATUS_FILTERS,
  TICKET_STATUSES,
  statusChipClass,
  statusI18nKey,
  ticketCategoryI18nKey,
} from '@/lib/supportConfig';
import {
  fetchAllTickets,
  fetchNotes,
  addNote,
  setTicketStatus,
  setTicketAssignee,
  subscribe,
  unsubscribe,
} from '@/lib/supportApi';
import TicketThread from './TicketThread';

const shortId = id => (id ? String(id).slice(0, 8) : '—');

/** Внутренняя заметка: видна только разработчикам, в API пользователю не отдаётся. */
function InternalNotes({ ticket, userId, notes, onAdded }) {
  const { t, lang } = useLanguage();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy) return;
    const body = text.trim();
    if (body.length < 1) return;
    setBusy(true);
    try {
      await addNote(ticket.id, userId, body);
      setText('');
      await onAdded();
    } catch (err) {
      toast.error(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="bg-amber-50/70 dark:bg-amber-500/5 border border-amber-200/70 dark:border-amber-500/20 rounded-[20px] p-4 space-y-3">
      <h3 className="text-xs font-black text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
        <StickyNote size={14} />
        {t('support.notes')}
      </h3>
      {notes.length === 0 && (
        <p className="text-[11px] text-amber-600/70 dark:text-amber-300/60">{t('support.noNotes')}</p>
      )}
      {notes.map(n => (
        <div key={n.id} className="bg-white dark:bg-slate-800 rounded-xl px-3 py-2 border border-amber-100 dark:border-slate-700">
          <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-line">{n.body}</p>
          <p className="text-[9px] text-slate-400 mt-1">
            {new Date(n.created_at).toLocaleString(lang)} · {shortId(n.developer_id)}
          </p>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('support.notePlaceholder')}
          onKeyDown={e => e.key === 'Enter' && add()}
          className="flex-1 border border-amber-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:border-amber-400"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || text.trim().length === 0}
          className="px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-bold disabled:opacity-50"
        >
          {t('support.noteAdd')}
        </button>
      </div>
    </div>
  );
}

/**
 * Панель разработчика: все обращения, статус, ответственный, ответы
 * (тип «developer» ставит сервер) и внутренние заметки.
 */
export default function DeveloperTab({ userId, onBack }) {
  const { t, lang } = useLanguage();
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const openSeqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAllTickets(filter)
      .then(list => {
        if (!alive) return;
        setTickets(list);
        // Открытая ветка подтягивает свежие поля из перезагруженного списка.
        setActive(prev => {
          if (!prev) return prev;
          const fresh = list.find(x => x.id === prev.id);
          return fresh ? { ...prev, ...fresh } : prev;
        });
      })
      .catch(err => toast.error(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filter, reloadKey]);

  // Realtime: обновления любых обращений (панель видит все); без неё — reloadKey.
  useEffect(() => {
    const channel = subscribe('support_tickets', () => setReloadKey(k => k + 1));
    return () => unsubscribe(channel);
  }, []);

  const bump = () => setReloadKey(k => k + 1);

  const openTicket = async ticket => {
    const seq = ++openSeqRef.current;
    setActive(ticket);
    try {
      const list = await fetchNotes(ticket.id);
      if (seq !== openSeqRef.current) return;
      setNotes(list);
    } catch {
      if (seq === openSeqRef.current) setNotes([]);
    }
  };

  const changeStatus = async status => {
    try {
      const updated = await setTicketStatus(active.id, status);
      setActive(updated);
      toast.success(t('support.statusChanged'));
      bump();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const assign = async developerId => {
    try {
      const updated = await setTicketAssignee(active.id, developerId);
      setActive(updated);
      bump();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (active) {
    return (
      <div className="space-y-3">
        <div className="bg-white dark:bg-slate-900 rounded-[20px] p-4 shadow-sm border border-slate-100 dark:border-slate-800/50 space-y-3">
          <button
            type="button"
            onClick={() => {
              openSeqRef.current += 1;
              setActive(null);
              setNotes([]);
              bump();
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600"
          >
            <ArrowLeft size={14} />
            {t('support.backToList')}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                {t('support.statusLabel')}
              </label>
              <select
                value={active.status}
                onChange={e => changeStatus(e.target.value)}
                className={`w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none bg-white dark:bg-slate-800 ${statusChipClass(active.status)}`}
              >
                {TICKET_STATUSES.map(s => (
                  <option key={s} value={s}>{t(statusI18nKey(s))}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                {t('support.assignee')}
              </label>
              <div className="flex gap-1.5">
                {active.assigned_developer_id === userId ? (
                  <button
                    type="button"
                    onClick={() => assign(null)}
                    className="flex-1 flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-[11px] font-bold text-slate-500 hover:text-red-500"
                  >
                    <UserMinus size={12} />
                    {t('support.unassign')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => assign(userId)}
                    className="flex-1 flex items-center justify-center gap-1 border border-blue-200 dark:border-blue-500/30 rounded-xl px-2 py-2 text-[11px] font-bold text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                  >
                    <UserCheck size={12} />
                    {t('support.take')}
                  </button>
                )}
              </div>
              {active.assigned_developer_id && (
                <p className="text-[10px] text-slate-400 mt-1">
                  {shortId(active.assigned_developer_id)}
                </p>
              )}
            </div>
          </div>
        </div>

        <TicketThread
          ticket={active}
          userId={userId}
          mode="dev"
          onChanged={bump}
        />

        <InternalNotes
          ticket={active}
          userId={userId}
          notes={notes}
          onAdded={async () => {
            const seq = openSeqRef.current;
            const list = await fetchNotes(active.id);
            if (seq === openSeqRef.current) setNotes(list);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <ShieldCheck size={14} />
          {t('support.devTitle')}
        </h2>
        <button
          type="button"
          aria-label={t('support.reload')}
          onClick={bump}
          className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 flex items-center justify-center"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
              filter === s
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500'
            }`}
          >
            {s === 'all' ? t('support.allStatuses') : t(statusI18nKey(s))}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-10 text-slate-400">
          <RefreshCw size={24} className="mx-auto animate-spin opacity-40" />
        </div>
      )}

      {!loading && tickets.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Inbox size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-xs">{t('support.noTickets')}</p>
        </div>
      )}

      {!loading && tickets.map(ticket => (
        <button
          key={ticket.id}
          type="button"
          onClick={() => openTicket(ticket)}
          className="w-full text-left bg-white dark:bg-slate-800 rounded-[20px] p-4 shadow-sm border border-slate-100 dark:border-slate-700/60 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
              #{ticket.ticket_number} {ticket.subject}
            </span>
            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${statusChipClass(ticket.status)}`}>
              {t(statusI18nKey(ticket.status))}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
            <span>{t(ticketCategoryI18nKey(ticket.category))}</span>
            <span>·</span>
            <span>{new Date(ticket.updated_at).toLocaleString(lang)}</span>
            {ticket.assigned_developer_id && (
              <>
                <span>·</span>
                <span>{shortId(ticket.assigned_developer_id)}</span>
              </>
            )}
          </div>
        </button>
      ))}

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 mt-2"
        >
          <ArrowLeft size={14} />
          {t('support.back')}
        </button>
      )}
    </div>
  );
}
