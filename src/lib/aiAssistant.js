/**
 * aiAssistant.js — ИИ-функции поверх Gemini:
 *  1. Чат-помощник (с контекстом города)
 *  2. Маршрут фразой
 *  3. Описание остановки
 *  4. Анализ маршрута (новое)
 *  5. Сводка событий на карте (новое)
 *  6. Озвучка текста
 */
import { geminiGenerate, geminiJSON, isGeminiConfigured } from '@/lib/gemini';

// ─── геокодинг ─────────────────────────────────────────────────────────

/** Геокодинг текста → точка (Nominatim, приоритет Таджикистану). */
export async function geocodeText(text, { lat = 40.28, lng = 69.62 } = {}) {
  const q = (text || '').trim();
  if (!q) return null;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'ru');
    url.searchParams.set('viewbox', `${lng - 2},${lat + 2},${lng + 2},${lat - 2}`);
    url.searchParams.set('bounded', '0');
    const resp = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Karta.AD/2.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const hit = data?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    const shortName = (hit.display_name || q).split(',').slice(0, 2).join(',').trim();
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), name: shortName, shortName };
  } catch {
    return null;
  }
}

// ─── маршрут фразой ────────────────────────────────────────────────────

/**
 * Маршрут фразой: "от вокзала до базара" → геокодинг → событие для карты.
 */
export async function requestRouteFromPhrase(fromText, toText, center) {
  const [from, to] = await Promise.all([
    geocodeText(fromText, center),
    geocodeText(toText, center),
  ]);
  if (!from && !to) return { ok: false, reason: 'Не нашёл ни «откуда», ни «куда». Уточни названия.' };
  if (!from) return { ok: false, reason: `Не нашёл «откуда»: ${fromText}` };
  if (!to) return { ok: false, reason: `Не нашёл «куда»: ${toText}` };
  window.dispatchEvent(new CustomEvent('karta_ai_route', { detail: { from, to } }));
  return { ok: true };
}

// ─── чат-помощник ──────────────────────────────────────────────────────

const CHAT_SYSTEM = (city) => `Ты — умный помощник транспортного приложения Karta-AD для Таджикистана.
Отвечай КОРОТКО (1-3 предложения), по-русски. Только про транспорт, маршруты, остановки, такси, город.
Город: ${city || 'Худжанд/Душанбе'}.
У тебя нет координат и данных о реальном движении — давай общие практичные советы.
Если спрашивают про конкретный маршрут — подскажи где искать (остановка, номер).
Без markdown-списков, просто текст. Будь дружелюбным.`;

const SUGGESTIONS_PROMPT = (city) => `Ты помощник Karta-AD (${city || 'Таджикистан'}).
Придумай 4 коротких вопроса-действия которые пользователь может захотеть сделать в транспортном приложении.
Верни СТРОГО JSON: {"actions":[{"label":"текст кнопки","query":"зрос для чата"}]}
Примеры: "Какие автобусы ходят?", "Как добраться до вокзала?", "Где ближайшая остановка?", "Сколько стоит такси?".
Больше про ${city || 'Худжанд и Душанбе'}.`;

/**
 * Чат с ИИ. Возвращает текст ответа или null.
 */
export async function askAssistant(history, { city = '' } = {}) {
  if (!isGeminiConfigured()) return null;
  const turns = (history || []).slice(-10).map(m =>
    `${m.role === 'assistant' ? 'Ассистент' : 'Пользователь'}: ${m.text}`
  ).join('\n');
  const prompt = `${CHAT_SYSTEM(city)}\nДиалог:\n${turns}\nАссистент:`;
  const raw = await geminiGenerate(prompt, {
    temperature: 0.5,
    timeoutMs: 15000,
    maxTokens: 512,
    jsonMode: false,
    retries: 1,
  });
  if (!raw) return null;
  return String(raw).replace(/```(?:\w+)?/g, '').trim().slice(0, 800) || null;
}

/**
 * Получить suggested quick actions для чата.
 */
export async function getChatSuggestions(city = '') {
  if (!isGeminiConfigured()) return null;
  const data = await geminiJSON(SUGGESTIONS_PROMPT(city), { timeoutMs: 8000, maxTokens: 256 });
  if (!data?.actions?.length) return null;
  return data.actions.slice(0, 4).map(a => ({
    label: String(a.label || '').slice(0, 40),
    query: String(a.query || '').slice(0, 80),
  })).filter(a => a.label && a.query);
}

// ─── описание остановки ────────────────────────────────────────────────

const STOP_DESC_PROMPT = (name, routes, city) => {
  const routesStr = routes.length
    ? routes.slice(0, 10).map(r => `#${r.number}${r.name ? ` (${r.name})` : ''}`).join(', ')
    : 'маршруты неизвестны';
  return `Остановка «${name}» (${city || 'Таджикистан'}).
Через неё идут: ${routesStr}.
Напиши 2-3 предложения:
1) Куда реально можно уехать с этой остановки (перечисли основные направления через запятую).
2) Один практический совет (где купить билет, сколько ждать, какой транспорт удобнее).
Только факты из списка маршрутов, ничего не выдумывай. Без markdown.`;
};

/**
 * ИИ-справка по остановке.
 */
export async function describeStop(stopName, servingRoutes = [], city = '') {
  if (!isGeminiConfigured()) return null;
  const raw = await geminiGenerate(
    STOP_DESC_PROMPT(stopName, servingRoutes, city),
    { temperature: 0.3, timeoutMs: 12000, maxTokens: 512, jsonMode: false, retries: 1 }
  );
  if (!raw) return null;
  return String(raw).replace(/```(?:\w+)?/g, '').trim().slice(0, 600) || null;
}

// ─── анализ маршрута (НОВОЕ) ───────────────────────────────────────────

const ANALYZE_ROUTE_PROMPT = (fromName, toName, distanceKm, durationMin) =>
  `Проанализируй маршрут «${fromName}» → «${toName}» (${distanceKm} км, ~${durationMin} мин).
Верни СТРОГО JSON: {
  "summary": "одно предложение — стоит ли ехать",
  "tips": ["совет 1", "совет 2"],
  "alternatives": ["альтернативный вариант 1", "альтернативный вариант 2"],
  "bestTime": "лучшее время для поездки",
  "warnings": ["предупреждение 1"] 
}
Советы — практичные (где сесть, как сэкономить, что взять).
Альтернативы — другой транспорт или маршрут.
Предупреждения — пробки, плохие дороги, если есть (иначе пустой массив).
Макс. 3 совета, 2 альтернативы, 2 предупреждения.`;

/**
 * Анализ маршрута: советы, альтернативы, предупреждения.
 */
export async function analyzeRoute(fromName, toName, distanceKm = 0, durationMin = 0) {
  if (!isGeminiConfigured()) return null;
  return geminiJSON(
    ANALYZE_ROUTE_PROMPT(fromName, toName, distanceKm, durationMin),
    { timeoutMs: 12000, maxTokens: 512 }
  );
}

// ─── сводка событий (НОВОЕ) ───────────────────────────────────────────

const SUMMARIZE_EVENTS_PROMPT = (events, city) => {
  const list = events.slice(0, 15).map(e =>
    `- ${e.type}: ${e.description || 'без описания'} (${e.lat?.toFixed(3)}, ${e.lng?.toFixed(3)})`
  ).join('\n');
  return `События на карте ${city || 'города'}:\n${list}\n\n
Верни СТРОГО JSON: {
  "summary": "общая обстановка 1-2 предложения",
  "hotspots": [{"area": "название района", "count": число, "mainType": "тип"}],
  "advice": "совет водителю 1 предложение"
}
hotspots —.setMax. 3 самых активных района (определи по координатам примерно).
advice — практический совет с учётом событий.`;
};

/**
 * AI-сводка по событиям на карте.
 */
export async function summarizeEvents(events, city = '') {
  if (!isGeminiConfigured() || !events?.length) return null;
  return geminiJSON(
    SUMMARIZE_EVENTS_PROMPT(events, city),
    { timeoutMs: 12000, maxTokens: 512 }
  );
}

// ─── голос ─────────────────────────────────────────────────────────────

/** Озвучить текст голосом из настроек навигатора. */
export function speakText(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return false;
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('karta_nav_settings') || '{}'); } catch {}
    if (cfg.voice_enabled === false) return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const langMap = { ru: 'ru-RU', tg: 'tg-TJ', en: 'en-US' };
    u.lang = langMap[cfg.voice_language] || 'ru-RU';
    if (typeof cfg.voice_volume === 'number') u.volume = Math.max(0, Math.min(1, cfg.voice_volume));
    try {
      const vs = synth.getVoices?.() || [];
      const pick = (cfg.voice_uri && vs.find(v => v.voiceURI === cfg.voice_uri))
        || vs.find(v => (v.lang || '').toLowerCase().startsWith(u.lang.split('-')[0].toLowerCase()))
        || vs.find(v => (v.lang || '').toLowerCase().startsWith('ru'));
      if (pick) { u.voice = pick; u.lang = pick.lang; }
    } catch {}
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}
