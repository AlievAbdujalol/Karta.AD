import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, Trash2, Volume2, VolumeX, Copy, Check } from 'lucide-react';
import { askAssistant, getChatSuggestions, speakText } from '@/lib/aiAssistant';
import { isGeminiConfigured, GeminiError } from '@/lib/gemini';

const WELCOME_MSG = { role: 'assistant', text: 'Привет! Я помощник Karta-AD. Спроси про маршруты, остановки или такси — помогу.' };

export default function AiChat({ cityName }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const sentRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, busy, scrollToBottom]);

  // Загрузка suggested actions при открытии
  useEffect(() => {
    if (open && !suggestions && isGeminiConfigured()) {
      getChatSuggestions(cityName).then(s => s && setSuggestions(s)).catch(() => {});
    }
  }, [open, suggestions, cityName]);

  // Фокус на input при открытии
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setError(null);

    if (!isGeminiConfigured()) {
      setMessages(prev => [...prev,
        { role: 'user', text: q },
        { role: 'assistant', text: 'ИИ не настроен. Добавь VITE_GEMINI_API_KEY в .env.local и перезапусти сервер.' },
      ]);
      setInput('');
      return;
    }

    const userMsg = { role: 'user', text: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setBusy(true);
    sentRef.current = true;

    try {
      const answer = await askAssistant(next, { city: cityName });
      if (answer) {
        setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
        if (voiceEnabled) speakText(answer);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: 'Не получилось ответить. Попробуй переформулировать.' }]);
      }
    } catch (err) {
      const msg = err instanceof GeminiError
        ? err.type === 'auth' ? 'Ошибка ключа API. Проверь VITE_GEMINI_API_KEY.'
          : err.type === 'rate' ? 'Слишком много запросов. Подожди немного.'
          : err.type === 'model' ? 'Модель недоступна. Обнови настройки.'
          : 'Ошибка сети. Проверь подключение к интернету.'
        : 'Неизвестная ошибка. Попробуй позже.';
      setError(msg);
      setMessages(prev => [...prev, { role: 'assistant', text: msg }]);
    } finally {
      setBusy(false);
    }
  };

  const clearChat = () => {
    setMessages([WELCOME_MSG]);
    setError(null);
    setSuggestions(null);
  };

  const copyMessage = (text, idx) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    }).catch(() => {});
  };

  const toggleVoice = () => setVoiceEnabled(v => !v);

  return (
    <>
      {/* Кнопка-пузырь */}
      <button
        onClick={() => { try { navigator.vibrate?.(15); } catch {} setOpen(o => !o); }}
        aria-label="ИИ-помощник"
        title="ИИ-помощник"
        className="absolute left-3 bottom-[104px] z-[500] w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white shadow-xl shadow-violet-500/30 flex items-center justify-center active:scale-95 transition-all"
      >
        {open ? <X size={19} /> : <Sparkles size={19} />}
      </button>

      {open && (
        <div className="absolute left-3 right-3 sm:right-auto sm:w-[370px] bottom-[156px] z-[560] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[55dvh]">

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-violet-600/10 to-fuchsia-500/10">
            <Sparkles size={15} className="text-violet-600" />
            <p className="text-[13px] font-extrabold text-slate-900 dark:text-white flex-1">
              Помощник{cityName ? ` · ${cityName}` : ''}
            </p>
            <button onClick={toggleVoice} title={voiceEnabled ? 'Выключить голос' : 'Включить голос'}
              className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
              {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <button onClick={clearChat} title="Очистить чат"
              className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
              <Trash2 size={14} />
            </button>
            <button onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div ref={boxRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-[140px] scroll-smooth">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                <div className={`relative max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'
                }`}>
                  <span className="whitespace-pre-wrap">{m.text}</span>
                  {m.role === 'assistant' && i > 0 && (
                    <button
                      onClick={() => copyMessage(m.text, i)}
                      className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-white dark:bg-slate-700 shadow border border-slate-200 dark:border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Копировать"
                    >
                      {copiedIdx === i ? <Check size={9} className="text-green-500" /> : <Copy size={9} className="text-slate-400" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 rounded-bl-md flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>

          {/* Suggested actions (показываются когда нет сообщений кроме приветствия) */}
          {suggestions && messages.length <= 1 && !busy && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s.query)}
                  className="px-2.5 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 text-[11px] font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors text-left leading-tight">
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
            </div>
          )}

          {/* Input */}
          <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Спроси про транспорт…"
              disabled={busy}
              className="flex-1 min-w-0 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-[13px] outline-none text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
            />
            <button onClick={() => send()} disabled={busy || !input.trim()}
              className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white flex items-center justify-center shrink-0 active:scale-95 transition-all">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
