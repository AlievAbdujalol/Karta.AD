import { useState } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AiRouteExplainer({ routeData }) {
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);

  const explain = async () => {
    setLoading(true);
    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
      const prompt = `Explain this route: ${JSON.stringify(routeData)}. Keep it helpful and concise.`;
      const result = await model.generateContent(prompt);
      setExplanation(result.response.text());
    } catch {
      toast.error('AI explanation failed');
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
