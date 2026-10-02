import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, Send, Loader2, Trash2, Volume2, VolumeX, Copy, Check, MapPin, Route, CarTaxiFront, Mic, MicOff, Radar } from 'lucide-react';
import { askAssistant, getChatSuggestions, speakText, stopSpeak, resolvePlaceFromText, getMyPosition } from '@/lib/aiAssistant';
import { isGeminiConfigured, GeminiError } from '@/lib/gemini';
import { toast } from 'sonner';

import { useCurrentUser } from '@/lib/useCurrentUser';
import { loadUserKeys } from '@/lib/userKeys';

const WELCOME_MSG = { role: 'assistant', text: 'Привет! Я помощник Karta-AD. Спроси про маршруты, остановки или такси — помогу.' };

export default function AiChat({ cityName, mapContext = {} }) {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  // Центр для поиска мест: позиция пользователя → центр карты → дефолт
  const searchCenter = mapContext.userPos || mapContext.center || null;
  const extraCtx = [
    mapContext.routesCount != null ? `маршрутов в базе: ${mapContext.routesCount}` : '',
    searchCenter ? 'координаты пользователя известны (ищи рядом)' : '',
  ].filter(Boolean).join('; ');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [listening, setListening] = useState(false);
  const lastPlaceRef = useRef(null);
  const recogRef = useRef(null);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const sentRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, busy, scrollToBottom]);

  useEffect(() => {
    if (user?.id) loadUserKeys(user.id).catch(() => {});
  }, [user?.id]);

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

  // Останавливаем озвучку при закрытии/размонтировании
  useEffect(() => () => { stopSpeak(); }, []);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setError(null);

    if (!isGeminiConfigured()) {
      setMessages(prev => [...prev,
        { role: 'user', text: q },
        { role: 'assistant', text: 'ИИ не настроен. Добавь свой ключ Gemini в Профиле → Мои AI-ключи (или общий VITE_GEMINI_API_KEY в .env.local).' },
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
    lastPlaceRef.current = null; // новое место — резолвим заново по требованию
    setPlaceName('');
    nearbyIdxRef.current = -1;

    try {
      const answer = await askAssistant(next, { city: cityName, extra: extraCtx });
      if (answer) {
        const idx = next.length;
        setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
        if (voiceEnabled) {
          setSpeakingIdx(idx);
          speakText(answer, { onEnd: () => setSpeakingIdx(s => (s === idx ? null : s)) });
        }
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
    stopSpeak();
    setSpeakingIdx(null);
    setMessages([WELCOME_MSG]);
    setError(null);
    setSuggestions(null);
  };

  const replayMessage = (text, idx) => {
    if (speakingIdx === idx) {
      stopSpeak();
      setSpeakingIdx(null);
      return;
    }
    setSpeakingIdx(idx);
    speakText(text, { onEnd: () => setSpeakingIdx(s => (s === idx ? null : s)) });
  };

  const closePanel = () => {
    stopSpeak();
    setSpeakingIdx(null);
    try { recogRef.current?.abort?.(); } catch {}
    setListening(false);
    setOpen(false);
  };

  const toggleListen = () => {
    if (listening) {
      try { recogRef.current?.stop?.(); } catch {}
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Голосовой ввод не поддерживается в этом браузере');
      return;
    }
    try {
      const rec = new SR();
      recogRef.current = rec;
      rec.lang = 'ru-RU';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => setListening(true);
      rec.onend = () => { setListening(false); recogRef.current = null; };
      rec.onerror = () => { setListening(false); recogRef.current = null; };
      rec.onresult = (e) => {
        const txt = e.results?.[0]?.[0]?.transcript || '';
        if (txt.trim()) {
          setInput('');
          send(txt.trim()); // сразу отправляем — руки свободны
        }
      };
      rec.start();
    } catch {
      toast.error('Не удалось включить микрофон');
    }
  };

  const copyMessage = (text, idx) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    }).catch(() => {});
  };

  const toggleVoice = () => setVoiceEnabled(v => {
    if (v) { stopSpeak(); setSpeakingIdx(null); }
    return !v;
  });

  // Место из последнего вопроса: рядом (GPS/центр карты), категории — через Overpass
  const [placeName, setPlaceName] = useState('');
  const nearbyIdxRef = useRef(-1);
  const resolvePlace = async () => {
    if (lastPlaceRef.current) return lastPlaceRef.current;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      toast.info('Сначала спроси про место');
      return null;
    }
    setResolving(true);
    try {
      const my = searchCenter || await getMyPosition();
      const p = await resolvePlaceFromText(lastUser.text, {
        city: cityName,
        ...(my ? { center: my } : {}),
      });
      if (!p) {
        toast.error('Не нашёл такое место рядом. Уточни (например: ресторан у вокзала)');
        return null;
      }
      lastPlaceRef.current = p;
      setPlaceName(p.shortName || '');
      if (p.isCategory && p.nearbyList?.length > 1) {
        const others = p.nearbyList.slice(1, 4).map((x) => `${x.name} (${x.d} м)`).join(', ');
        toast.success(`${p.shortName} · ${p.d} м. Рядом ещё: ${others}`, { duration: 5000 });
      }
      return p;
    } finally {
      setResolving(false);
    }
  };

  const clearPlace = () => {
    lastPlaceRef.current = null;
    setPlaceName('');
    nearbyIdxRef.current = -1;
  };

  // «Рядом»: листает найденные точки категории по кругу
  const chipNearby = async () => {
    const p = await resolvePlace();
    if (!p) return;
    const list = p.nearbyList?.length ? p.nearbyList : [p];
    nearbyIdxRef.current = (nearbyIdxRef.current + 1) % list.length;
    const t = list[nearbyIdxRef.current];
    lastPlaceRef.current = t.isCategory ? t : { ...t, nearbyList: list, isCategory: true };
    setPlaceName(t.shortName || '');
    window.dispatchEvent(new CustomEvent('karta_ai_flyto', { detail: { lat: t.lat, lng: t.lng, zoom: 16 } }));
    toast.success(`${t.name}${t.d != null ? ` · ${t.d} м` : ''} (${nearbyIdxRef.current + 1}/${list.length})`);
  };

  const chipFlyTo = async () => {
    const p = await resolvePlace();
    if (!p) return;
    window.dispatchEvent(new CustomEvent('karta_ai_flyto', { detail: { lat: p.lat, lng: p.lng, zoom: 16 } }));
    toast.success(p.shortName || 'Точка на карте');
  };

  const chipRoute = async () => {
    const p = await resolvePlace();
    if (!p) return;
    const my = await getMyPosition();
    if (!my) {
      toast.error('Разреши геолокацию — построю маршрут от тебя');
      return;
    }
    const from = { ...my, shortName: 'Моё место', name: 'Моё место' };
    const to = { ...p, name: p.shortName, shortName: p.shortName };
    window.dispatchEvent(new CustomEvent('karta_ai_route', { detail: { from, to } }));
  };

  const chipTaxi = async () => {
    const p = await resolvePlace();
    if (!p) return;
    navigate('/taxi', {
      state: { trip: { to: { name: p.shortName, lat: p.lat, lng: p.lng } } },
    });
  };

  return (
    <>
      {/* Кнопка-пузырь */}
      <button
        onClick={() => { try { navigator.vibrate?.(15); } catch {} if (open) closePanel(); else setOpen(true); }}
        aria-label="ИИ-помощник"
        title="ИИ-помощник"
        className="absolute left-3 bottom-[104px] z-[500] w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white shadow-xl shadow-violet-500/30 flex items-center justify-center active:scale-95 transition-all"
      >
        {open ? <X size={19} /> : <Sparkles size={19} />}
      </button>

      {open && (
        <div className="absolute left-3 right-3 sm:right-auto sm:w-[370px] bottom-[156px] z-[560] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[55dvh]">

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-violet-600 via-violet-600/90 to-fuchsia-600 text-white">
            <span className="relative flex w-8 h-8 rounded-xl bg-white/20 items-center justify-center shrink-0">
              <Sparkles size={15} />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-violet-600" title="На связи" />
            </span>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-[13px] font-extrabold truncate">
                Помощник{cityName ? ` · ${cityName}` : ''}
              </p>
              <p className="text-[10px] font-medium opacity-80">на связи · знает карту и город</p>
            </div>
            <button onClick={toggleVoice} title={voiceEnabled ? 'Выключить голос' : 'Включить голос'}
              className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/90">
              {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <button onClick={() => { clearChat(); clearPlace(); }} title="Очистить чат"
              className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/90">
              <Trash2 size={14} />
            </button>
            <button onClick={closePanel}
              className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/90">
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
                    <div className="absolute -top-2 right-1 flex gap-1">
                      <button
                        onClick={() => replayMessage(m.text, i)}
                        className="w-5 h-5 rounded-full bg-white dark:bg-slate-700 shadow border border-slate-200 dark:border-slate-600 flex items-center justify-center"
                        title={speakingIdx === i ? 'Остановить' : 'Озвучить'}
                      >
                        {speakingIdx === i
                          ? <Volume2 size={9} className="text-violet-600 animate-pulse" />
                          : <Volume2 size={9} className="text-slate-400" />}
                      </button>
                      <button
                        onClick={() => copyMessage(m.text, i)}
                        className="w-5 h-5 rounded-full bg-white dark:bg-slate-700 shadow border border-slate-200 dark:border-slate-600 hidden group-hover:flex items-center justify-center"
                        title="Копировать"
                      >
                        {copiedIdx === i ? <Check size={9} className="text-green-500" /> : <Copy size={9} className="text-slate-400" />}
                      </button>
                    </div>
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

          {/* Действия с картой — всегда под рукой */}
          {!busy && (
            <div className="px-3 pb-2 space-y-1.5">
              {placeName && (
                <button onClick={clearPlace}
                  className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:opacity-80 transition-opacity">
                  <MapPin size={11} />
                  <span className="truncate max-w-[220px]">{placeName}</span>
                  <X size={11} />
                </button>
              )}
              <div className="flex gap-1.5">
                <button onClick={chipFlyTo} disabled={resolving}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors">
                  <MapPin size={12} /> На карте
                </button>
                <button onClick={chipRoute} disabled={resolving}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 disabled:opacity-50 transition-colors">
                  <Route size={12} /> Маршрут
                </button>
                <button onClick={chipTaxi} disabled={resolving}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-500/10 text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
                  <CarTaxiFront size={12} /> Такси
                </button>
                <button onClick={chipNearby} disabled={resolving} title="Что рядом со мной"
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-500/10 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 disabled:opacity-50 transition-colors">
                  <Radar size={12} /> Рядом
                </button>
              </div>
            </div>
          )}

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
            <button onClick={toggleListen} title="Голосовой ввод"
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 active:scale-95 transition-all ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
              {listening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
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
