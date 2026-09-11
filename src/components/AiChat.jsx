import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { askAssistant } from '@/lib/aiAssistant';
import { isGeminiConfigured } from '@/lib/gemini';

export default function AiChat({ cityName }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Привет! Спроси про маршруты, остановки или такси — помогу.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    if (!isGeminiConfigured()) {
      setMessages(prev => [...prev,
        { role: 'user', text: q },
        { role: 'assistant', text: 'ИИ не настроен: добавь VITE_GEMINI_API_KEY в .env.local и перезапусти.' },
      ]);
      setInput('');
      return;
    }
    const next = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const answer = await askAssistant(next, { city: cityName });
      setMessages(prev => [...prev, { role: 'assistant', text: answer || 'Не получилось ответить, попробуй ещё раз.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Ошибка сети, попробуй позже.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { try { navigator.vibrate?.(15); } catch {} setOpen(o => !o); }}
        aria-label="ИИ-помощник"
        title="ИИ-помощник"
        className="absolute left-3 bottom-[104px] z-[500] w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white shadow-xl shadow-violet-500/30 flex items-center justify-center active:scale-95 transition-all"
      >
        {open ? <X size={19} /> : <Sparkles size={19} />}
      </button>
      {open && (
        <div className="absolute left-3 right-3 sm:right-auto sm:w-[360px] bottom-[156px] z-[560] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[52dvh]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-violet-600/10 to-fuchsia-500/10">
            <Sparkles size={15} className="text-violet-600" />
            <p className="text-[13px] font-extrabold text-slate-900 dark:text-white flex-1">Помощник</p>
            <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"><X size={14} /></button>
          </div>
          <div ref={boxRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[140px]">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-snug ${
                  m.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'
                }`}>{m.text}</div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 rounded-bl-md">
                  <Loader2 size={14} className="animate-spin text-violet-600" />
                </div>
              </div>
            )}
          </div>
          <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Спроси про транспорт…"
              className="flex-1 min-w-0 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-[13px] outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            <button onClick={() => send()} disabled={busy || !input.trim()}
              className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white flex items-center justify-center shrink-0">
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
