import { Send, Loader2, Bot, User } from 'lucide-react';
import AIModelSelector from '@/components/AIModelSelector';
import { QUICK_TEMPLATES } from '@/lib/siteBuilder';

/**
 * Левая панель: чат + шаблоны + ввод + селектор модели снизу.
 */
export default function BuilderChat({
  messages, busy, stage, prompt, setPrompt, onSend,
  models, modelsLoading, modelsError, modelsUpdated, model, onModelChange, onRefreshModels,
}) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 md:rounded-2xl border-0 md:border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* История */}
      <div className="flex-1 overflow-y-auto scrollbar-ui p-3 space-y-2.5 min-h-[180px]">
        {messages.length === 0 && (
          <div className="text-center pt-6 pb-2">
            <div className="text-4xl mb-2">🤖</div>
            <p className="text-[15px] font-extrabold text-slate-800 dark:text-slate-100">Создай сайт с помощью AI</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">Опиши, какой сайт тебе нужен.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${
              m.role === 'user'
                ? 'bg-violet-600 text-white rounded-br-md'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'
            }`}>
              <div className="flex items-center gap-1.5 mb-1 opacity-70">
                {m.role === 'user' ? <User size={11} /> : <Bot size={11} />}
                <span className="text-[10px] font-bold uppercase tracking-wide">{m.role === 'user' ? 'Ты' : 'AI'}</span>
              </div>
              <span className="whitespace-pre-wrap">{m.text}</span>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 rounded-bl-md">
              <p className="text-[12px] font-bold text-violet-600 dark:text-violet-300 animate-pulse">{stage || 'Думаю…'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Шаблоны */}
      {messages.length === 0 && (
        <div className="px-3 pb-2 grid grid-cols-4 gap-1.5">
          {QUICK_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => setPrompt(t.prompt)}
              className="px-1.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-500/20 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors leading-tight"
            >
              <span className="block text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Ввод */}
      <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
            placeholder="Например: Создай современный магазин телефонов с каталогом…"
            disabled={busy}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none disabled:opacity-50"
          />
          <button
            onClick={onSend}
            disabled={busy || !prompt.trim()}
            className="px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send
          </button>
        </div>
        <AIModelSelector
          models={models}
          loading={modelsLoading}
          error={models.length ? null : modelsError}
          updatedAt={modelsUpdated}
          value={model}
          onChange={onModelChange}
          onRefresh={onRefreshModels}
        />
      </div>
    </div>
  );
}
