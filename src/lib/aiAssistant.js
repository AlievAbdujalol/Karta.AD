/**
 * aiAssistant.js — ИИ-возможности поверх Gemini:
 *  1. маршрут фразой («довези от вокзала до базара»),
 *  2. чат-помощник про транспорт,
 *  3. озвучка результата голосового поиска,
 *  4. ИИ-справка по остановке.
 */
import { geminiGenerate, isGeminiConfigured } from '@/lib/gemini';

/** Геокодинг названия в точку (Nominatim, с приоритетом Таджикистану). */
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
      headers: { 'User-Agent': 'Karta.AD/1.0' },
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

/**
 * Маршрут фразой: геокодирует from/to и просит карту открыть построение.
 * Возвращает { ok, reason? }. Слушатель — BusMap (событие karta_ai_route).
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

const CHAT_SYSTEM = `Ты помощник транспортного приложения Karta-AD (Таджикистан: Худжанд, Душанбе).
Отвечай КОРОТКО (1-3 предложения), по-русски, только про транспорт, маршруты, остановки, такси.
Точек и координат у тебя нет — давай общие практические советы. Без markdown-списков, просто текст.`;

/**
 * Чат с ИИ. history: [{role:'user'|'assistant', text}]. Возвращает текст ответа или null.
 */
export async function askAssistant(history, { city = '' } = {}) {
  if (!isGeminiConfigured()) return null;
  const turns = (history || []).slice(-8).map(m =>
    `${m.role === 'assistant' ? 'Ассистент' : 'Пользователь'}: ${m.text}`
  ).join('\n');
  const prompt = `${CHAT_SYSTEM}\nГород пользователя: ${city || 'неизвестен'}.\nДиалог:\n${turns}\nАссистент:`;
  const raw = await geminiGenerate(prompt, { temperature: 0.5, timeoutMs: 15000 });
  if (!raw) return null;
  return String(raw).replace(/```(?:\w+)?/g, '').trim().slice(0, 800) || null;
}

/**
 * ИИ-справка по остановке: какие маршруты идут + короткий совет.
 * servingRoutes: [{number, name}] — берём из данных, ИИ только оформляет.
 */
export async function describeStop(stopName, servingRoutes = []) {
  if (!isGeminiConfigured()) return null;
  const routesStr = servingRoutes.length
    ? servingRoutes.slice(0, 8).map(r => `#${r.number}${r.name ? ` (${r.name})` : ''}`).join(', ')
    : 'маршруты неизвестны';
  const prompt = `Остановка «${stopName}» (Таджикистан). Через неё идут: ${routesStr}. ` +
    `Напиши за 2 предложения: куда реально можно уехать с этой остановки и один практический совет. Только факты из списка, ничего не выдумывай. Без markdown.`;
  const raw = await geminiGenerate(prompt, { temperature: 0.3, timeoutMs: 12000 });
  if (!raw) return null;
  return String(raw).replace(/```(?:\w+)?/g, '').trim().slice(0, 500) || null;
}

/** Озвучить текст голосом из настроек навигатора (тихо падает, если нельзя). */
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
