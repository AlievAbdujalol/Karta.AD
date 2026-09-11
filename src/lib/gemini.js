/**
 * gemini.js — лёгкий клиент Google Gemini (REST, без npm-зависимостей).
 * Ключ берётся из VITE_GEMINI_API_KEY (см. .env.example).
 *
 * ВНИМАНИЕ: ключ во фронтенде виден в devtools/сетевых запросах.
 * Для продакшена лучше проксировать через Supabase Edge Function
 * с ключом в secrets — клиент оставить как есть, сменить только endpoint.
 */

const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function getGeminiKey() {
  const k = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  return k || null;
}

export function isGeminiConfigured() {
  return !!getGeminiKey();
}

function extractJson(text) {
  if (!text) return null;
  // убираем markdown-обёртку ```json ... ```
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Сырой вызов generateContent. Возвращает текст ответа или null.
 */
export async function geminiGenerate(prompt, { model = DEFAULT_MODEL, timeoutMs = 12000, temperature = 0.1 } = {}) {
  const key = getGeminiKey();
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(
      `${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctl.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, responseMimeType: 'application/json', maxOutputTokens: 512 },
        }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const INTENT_PROMPT = (query) => `Ты парсер поисковых запросов транспортного приложения (Таджикистан, города Худжанд/Душанбе).
Верни СТРОГО JSON без пояснений: {"action":"route|stop|place|address","routeNumber":null|string,"stopName":null|string,"place":null|string,"from":null|string,"to":null|string,"terms":[string]}
Правила:
- action=route если спрашивают маршрут/автобус ("какой автобус", "маршрут 66", "как доехать от X до Y").
- routeNumber — только цифры/буквы номера ("66", "8А").
- stopName — название остановки, place — место (базар, больница, вокзал), from/to — точки "от ... до ...".
- terms — 1-4 коротких ключевых слова для поиска (названия без предлогов).
- Пустые поля = null. terms всегда непустой (выжми главное из запроса).
Запрос: "${query.replace(/"/g, '')}"`;

/**
 * Разбирает запрос на естественном языке в структуру для поиска.
 * Возвращает intent-объект или null (тогда caller делает обычный поиск).
 */
export async function parseSearchIntent(query, { timeoutMs = 10000 } = {}) {
  const q = (query || '').trim();
  if (!q || !isGeminiConfigured()) return null;
  const raw = await geminiGenerate(INTENT_PROMPT(q), { timeoutMs });
  const intent = extractJson(raw);
  if (!intent || !Array.isArray(intent.terms) || !intent.terms.length) return null;
  return {
    action: ['route', 'stop', 'place', 'address'].includes(intent.action) ? intent.action : 'place',
    routeNumber: intent.routeNumber || null,
    stopName: intent.stopName || null,
    place: intent.place || null,
    from: intent.from || null,
    to: intent.to || null,
    terms: [...new Set(intent.terms.map(t => String(t || '').trim()).filter(Boolean))].slice(0, 4),
  };
}
