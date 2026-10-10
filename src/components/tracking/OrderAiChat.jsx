import { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Loader2, User } from 'lucide-react';
import { askOrderAi } from '@/lib/orderAssistant';
import { summarizeOrder, STORE_STATUS_LABEL, MAX_QUESTION_LENGTH } from '@/lib/orderTracking';

/**
 * OrderAiChat — ИИ-помощник по заказу на странице отслеживания.
 *
 * Модель отвечает ТОЛЬКО по данным трекинга (спецификация §28, §59):
 * контекст собирает buildTrackingContext, никаких других данных модель
 * не видит. При отказе ИИ показывается детерминированная сводка
 * (summarizeOrder) — без выдуманного ETA и статусов.
 */

const CHIPS = ['Где мой заказ?', 'Когда прибудёт заказ?', 'Что дальше?'];

const SYSTEM_FALLBACK = 'ИИ-ассистент временно недоступен — статус заказа выше всегда точен, он из системы.';
const NO_KEY_HINT = 'ИИ-ассистент пока не подключён владельцем сервиса. Статус заказа выше всегда точен — он из системы.';
const TOO_MANY = 'Слишком много вопросов — подождите минуту и спросите снова.';

/** Клиентский троттлинг: не чаще 5 вопросов в минуту. */
const ASK_LIMIT = 5;
const ASK_WINDOW_MS = 60_000;

export default function OrderAiChat({ data, statusLabels = STORE_STATUS_LABEL }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const startedFor = useRef(null);
  const askTimes = useRef([]);

  const orderId = data?.order_id || data?.public_id || null;

  // Одна авто-сводка на заказ: детерминированный фолбэк сразу,
  // затем — ИИ-комментарий; поздний ответ подменяет только фолбэк,
  // если пользователь уже успел спросить (не стирает его историю).
  useEffect(() => {
    if (!orderId || !data?.found) return undefined;
    if (startedFor.current === orderId) return undefined;
    startedFor.current = orderId;

    const fallback = summarizeOrder(data, statusLabels);
    if (fallback) setMessages([{ role: 'ai', text: fallback, ai: false }]);

    (async () => {
      const res = await askOrderAi({
        data,
        question: 'Кратко охарактеризуй текущий статус моего заказа.',
      });
      if (res.ok) {
        setMessages((m) => (m.length === 1 && m[0]?.ai === false
          ? [{ role: 'ai', text: res.text, ai: true }]
          : m));
      }
    })();
    return undefined;
  }, [orderId, data, statusLabels]);

  function throttled() {
    const now = Date.now();
    askTimes.current = askTimes.current.filter((t) => now - t < ASK_WINDOW_MS);
    if (askTimes.current.length >= ASK_LIMIT) return true;
    askTimes.current.push(now);
    return false;
  }

  async function ask(question) {
    const q = String(question || '').trim().slice(0, MAX_QUESTION_LENGTH);
    if (!q || busy || !data?.found) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    if (throttled()) {
      setMessages((m) => [...m, { role: 'system', text: TOO_MANY }]);
      return;
    }
    setBusy(true);
    const res = await askOrderAi({ data, question: q });
    setBusy(false);
    setMessages((m) => [...m, res.ok
      ? { role: 'ai', text: res.text, ai: true }
      : { role: 'system', text: res.reason === 'no_key' ? NO_KEY_HINT : SYSTEM_FALLBACK }]);
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          ИИ-помощник по заказу
        </p>
      </div>

      {messages.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto" aria-live="polite">
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <span className="inline-flex items-center gap-1.5 max-w-[85%] text-right text-xs px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  <User className="w-3 h-3 shrink-0" />
                  {m.text}
                </span>
              </div>
            ) : m.role === 'system' ? (
              <p key={i} className="text-xs text-slate-400 dark:text-slate-500">{m.text}</p>
            ) : (
              <p key={i} className="text-xs px-2.5 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-slate-800 dark:text-violet-100">
                {m.ai ? '✨ ' : ''}{m.text}
              </p>
            )
          ))}
          {busy && (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              ИИ думает…
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => ask(q)}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Спросить ИИ о заказе…"
          aria-label="Спросить ИИ о заказе"
          maxLength={MAX_QUESTION_LENGTH}
          className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="p-2 rounded-lg bg-violet-600 text-white disabled:opacity-50 hover:bg-violet-700 transition-colors"
          aria-label="Спросить ИИ"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
