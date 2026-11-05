import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { geminiGenerate, geminiErrorText, isGeminiConfigured } from '@/lib/gemini';

/**
 * «Объяснить маршрут с ИИ».
 *
 * Раньше здесь был свой вызов через @google/generative-ai: SDK ходит на
 * v1beta с жёстко зашитой моделью gemini-3.5-flash — в проде это 503
 * («AI explanation failed») и POST напрямую на generativelanguage.googleapis.com.
 * Теперь используется общий клиент проекта (src/lib/gemini.js): endpoint v1,
 * модель gemini-3.6-flash, thinkingConfig { thinkingBudget: 0 }, фильтр
 * thought-частей, ретраи и честная классификация ошибок.
 */
export default function AiRouteExplainer({ routeData }) {
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);

  const explain = async () => {
    setLoading(true);
    try {
      if (!isGeminiConfigured()) {
        toast.error('ИИ не настроен: нет ключа API');
        return;
      }
      const prompt = `Explain this route: ${JSON.stringify(routeData)}. Keep it helpful and concise.`;
      const text = await geminiGenerate(prompt, {
        jsonMode: false,
        maxTokens: 512,
        retries: 1,
        timeoutMs: 20000,
      });
      if (text) setExplanation(text);
      else toast.error('ИИ не ответил. Попробуй ещё раз.');
    } catch (err) {
      toast.error(geminiErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-2">
      <button onClick={explain} disabled={loading} className="flex items-center gap-2 text-sm font-bold text-blue-600">
        {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={16} />} Explain with AI
      </button>
      {explanation && <p className="text-xs text-slate-600 dark:text-slate-300">{explanation}</p>}
    </div>
  );
}
