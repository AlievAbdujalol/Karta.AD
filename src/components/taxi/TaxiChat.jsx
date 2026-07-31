import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { supabase } from '@/api/supabase';

export default function TaxiChat({ open, onClose, orderId, meId, otherName }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (!open || !orderId || !meId) return;
    setMessages([]);
    setLoading(true);
    let alive = true;
    supabase.from('taxi_messages')
      .select('id, sender_id, message, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (alive) { setMessages(data || []); setLoading(false); } });

    const sub = supabase.channel(`taxi-chat-${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taxi_messages', filter: `order_id=eq.${orderId}` }, (payload) => {
        if (payload.new) setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(sub); };
  }, [open, orderId, meId]);

  useEffect(() => { if (open) scrollDown(); }, [messages, open, scrollDown]);

  const handleSend = useCallback(async () => {
    const msg = text.trim();
    if (!msg || !orderId) return;
    setText('');
    const { error } = await supabase.from('taxi_messages').insert({
      order_id: orderId,
      sender_id: meId,
      message: msg,
    });
    if (error) {
      console.error(error);
      setText(msg);
    }
  }, [text, orderId, meId]);

  if (!open) return null;

  const time = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <button onClick={onClose} className="text-slate-500"><X size={20} /></button>
        <div className="flex-1 flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <MessageCircle size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-bold">{otherName || 'Собеседник'}</p>
            <p className="text-[10px] text-slate-400">Чат поездки · в реальном времени</p>
          </div>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && <p className="text-center text-xs text-slate-400 py-6">Загрузка...</p>}
        {!loading && messages.length === 0 && (
          <div className="text-center py-10">
            <MessageCircle size={32} className="text-slate-200 dark:text-slate-800 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Сообщений пока нет.<br />Напишите первым — например, где вы стоите.</p>
          </div>
        )}
        {messages.map(m => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                mine
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-md'
              }`}>
                <p className="break-words">{m.message}</p>
                <p className={`text-[9px] mt-1 ${mine ? 'text-blue-200' : 'text-slate-400'}`}>{time(m.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 p-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Сообщение..."
          className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
            text.trim() ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 active:scale-95' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
          }`}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
