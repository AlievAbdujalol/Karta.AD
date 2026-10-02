/**
 * aiAssistant.js — ИИ-функции поверх Gemini:
 *  1. Чат-помощник (с контекстом города)
 *  2. Маршрут фразой
 *  3. Описание остановки
 *  4. Анализ маршрута (новое)
 *  5. Сводка событий на карте (новое)
 *  6. Озвучка текста
 */
import { geminiGenerate, geminiJSON, isGeminiConfigured, parseSearchIntent } from '@/lib/gemini';

// ─── геокодинг ─────────────────────────────────────────────────────────

import { haversineM } from '@/lib/geo';

// ─── категории мест (Overpass вокруг точки) ────────────────────

const OVERPASS_URLS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const CATEGORY_TAGS = [
  { keys: ['ресторан', 'рестик', 'поесть', 'еда'], label: 'рестораны', clause: 'node["amenity"="restaurant"]' },
  { keys: ['кафе', 'кофейн', 'чайхана', 'чайхан'], label: 'кафе', clause: 'node["amenity"~"cafe|canteen|fast_food"]' },
  { keys: ['аптека', 'аптеку', 'лекарств'], label: 'аптеки', clause: 'node["amenity"="pharmacy"]' },
  { keys: ['больница', 'больницу', 'поликлиник', 'врач', 'доктор'], label: 'больницы', clause: 'node["amenity"~"hospital|doctors|clinic"]' },
  { keys: ['банк', 'обмен', 'валют'], label: 'банки', clause: 'node["amenity"="bank"]' },
  { keys: ['банкомат', 'терминал', 'снять деньги'], label: 'банкоматы', clause: 'node["amenity"="atm"]' },
  { keys: ['азс', 'заправк', 'бензин'], label: 'заправки', clause: 'node["amenity"="fuel"]' },
  { keys: ['отель', 'гостиниц', 'хостел', 'ночлег'], label: 'отели', clause: 'node["tourism"~"hotel|hostel|guest_house"]' },
  { keys: ['магазин', 'маркет', 'супермаркет', 'базар', 'рынок', 'продуктов'], label: 'магазины', clause: 'node["shop"]' },
  { keys: ['парковк', 'стоянк'], label: 'парковки', clause: 'node["amenity"="parking"]' },
  { keys: ['мечеть', 'молитв'], label: 'мечети', clause: 'node["amenity"="place_of_worship"]' },
  { keys: ['парк', 'сквер', 'погулять'], label: 'парки', clause: 'node["leisure"="park"]' },
  { keys: ['вокзал', 'автовокзал', 'станция'], label: 'вокзалы', clause: 'node["amenity"~"bus_station|ferry_terminal"]' },
  { keys: ['туалет'], label: 'туалеты', clause: 'node["amenity"="toilets"]' },
  { keys: ['кино', 'кинотеатр', 'фильм'], label: 'кинотеатры', clause: 'node["amenity"="cinema"]' },
  { keys: ['школа'], label: 'школы', clause: 'node["amenity"="school"]' },
];

/** Найти категорию в тексте вопроса. */
export function detectCategory(text) {
  const q = (text || '').toLowerCase();
  return CATEGORY_TAGS.find((c) => c.keys.some((k) => q.includes(k))) || null;
}

/** Ближайшие места категории вокруг центра (Overpass, топ-5). */
export async function searchNearbyCategory(text, center, radius = 3000) {
  const cat = detectCategory(text);
  if (!cat || !center || center.lat == null) return null;
  const query = `[out:json][timeout:12];(${cat.clause}(around:${radius},${center.lat},${center.lng}););out body 5;`;
  for (const base of OVERPASS_URLS) {
    try {
      const resp = await fetch(`${base}?data=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const list = (data?.elements || [])
        .filter((el) => el.lat != null && el.lon != null)
        .map((el) => ({
          lat: el.lat,
          lng: el.lon,
          name: el.tags?.name || el.tags?.['name:ru'] || `${cat.label} рядом`,
          shortName: el.tags?.name || el.tags?.['name:ru'] || `${cat.label} рядом`,
          d: Math.round(haversineM(center.lat, center.lng, el.lat, el.lon)),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);
      return { category: cat, list };
    } catch {
      continue;
    }
  }
  return null;
}

/** Геокодинг текста → ближайшая к центру точка (только TJ/UZ/KG). */
export async function geocodeText(text, { lat = 40.28, lng = 69.62 } = {}) {
  const q = (text || '').trim();
  if (!q) return null;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '5');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'ru');
    url.searchParams.set('countrycodes', 'tj,uz,kg');
    url.searchParams.set('viewbox', `${lng - 2},${lat + 2},${lng + 2},${lat - 2}`);
    url.searchParams.set('bounded', '0');
    const resp = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Karta.AD/2.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) return null;
    // Ближайший к центру, а не первый попавшийся (не другая страна/город)
    const ranked = data
      .filter((h) => h?.lat && h?.lon)
      .map((h) => ({
        hit: h,
        d: haversineM(lat, lng, parseFloat(h.lat), parseFloat(h.lon)),
      }))
      .sort((a, b) => a.d - b.d);
    if (!ranked.length) return null;
    const hit = ranked[0].hit;
    const shortName = (hit.display_name || q).split(',').slice(0, 2).join(',').trim();
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), name: shortName, shortName, distanceM: Math.round(ranked[0].d) };
  } catch {
    return null;
  }
}

// ─── маршрут фразой ────────────────────────────────────────────────────

/** Текущая геопозиция один раз (для «маршрут отсюда»). */
export function getMyPosition({ timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
    setTimeout(() => finish(null), timeout + 500);
  });
}

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

/**
 * Место из свободного вопроса: сначала ИИ-парсер интента выделяет
 * топоним (а не весь вопрос целиком), потом геокодинг кандидатов по очереди.
 * Возвращает точку или null.
 */
export async function resolvePlaceFromText(text, { city = '', center = null } = {}) {
  const q = (text || '').trim();
  if (!q) return null;
  const geoCenter = center && center.lat != null ? center : undefined;
  // 0) Категория («ресторан рядом») — ближайшие вокруг центра
  if (geoCenter && detectCategory(q)) {
    try {
      const near = await searchNearbyCategory(q, geoCenter);
      if (near?.list?.length) {
        const best = near.list[0];
        return { ...best, isCategory: true, categoryLabel: near.category.label, nearbyList: near.list };
      }
    } catch {}
  }
  const candidates = [];
  try {
    if (isGeminiConfigured()) {
      const intent = await parseSearchIntent(q, { city, timeoutMs: 8000 });
      if (intent) {
        for (const key of ['place', 'stopName', 'to', 'from']) {
          if (intent[key]) candidates.push(intent[key]);
        }
        if (Array.isArray(intent.terms) && intent.terms.length) {
          candidates.push(intent.terms.join(' '));
        }
      }
    }
  } catch {}
  candidates.push(q);
  const seen = new Set();
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const hit = await geocodeText(c, geoCenter || {});
      if (hit) return hit;
    } catch {}
  }
  return null;
}

const CHAT_SYSTEM = (city) => `Ты — умный помощник транспортного приложения Karta-AD для Таджикистана.
Отвечай КОРОТКО (1-3 предложения), по-русски. Темы: транспорт, маршруты, остановки, такси, город.
Город: ${city || 'Худжанд/Душанбе'}.
У тебя нет координат и данных о реальном движении — давай общие практичные советы.
Давай и житейские советы по теме: где перекусить рядом, как сэкономить, когда лучше ехать, что взять с собой.
Если спрашивают про конкретный маршрут — подскажи где искать (остановка, номер).
Возможности приложения (рекомендуй ИХ вместо сторонних сервисов):
- Такси Karta-AD: заказ во вкладке «Такси» внизу экрана — подача рядом, цена видна сразу, оплата наличными или балансом.
- Маршруты: кнопка «Маршрут» — авто, такси, пешком, вело, автобус, маршрутка с пересадками.
- Остановки, расписание и события на дорогах — на карте и в поиске сверху.
- Офлайн-карты: Профиль → Офлайн-карты.
Если спрашивают про такси — первым делом предлагай Такси Karta-AD во вкладке «Такси», чужие диспетчерские только как запасной вариант.
Завершай ответ одной короткой подсказкой про возможность карты, если уместно (маршрут/такси/остановки).
Без markdown-списков, просто текст. Будь дружелюбным.`;

const SUGGESTIONS_PROMPT = (city) => `Ты помощник Karta-AD (${city || 'Таджикистан'}).
Придумай 4 коротких вопроса-действия которые пользователь может захотеть сделать в транспортном приложении.
Верни СТРОГО JSON: {"actions":[{"label":"текст кнопки","query":"зрос для чата"}]}
Примеры: "Какие автобусы ходят?", "Как добраться до вокзала?", "Где ближайшая остановка?", "Сколько стоит такси?".
Больше про ${city || 'Худжанд и Душанбе'}.`;

/**
 * Чат с ИИ. Возвращает текст ответа или null.
 */
export async function askAssistant(history, { city = '', extra = '' } = {}) {
  if (!isGeminiConfigured()) return null;
  const turns = (history || []).slice(-10).map(m =>
    `${m.role === 'assistant' ? 'Ассистент' : 'Пользователь'}: ${m.text}`
  ).join('\n');
  const ctx = extra ? `\nКонтекст приложения: ${extra}` : '';
  const prompt = `${CHAT_SYSTEM(city)}${ctx}\nДиалог:\n${turns}\nАссистент:`;
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

let ttsToken = 0;

/** Остановить текущую озвучку. */
export function stopSpeak() {
  ttsToken++;
  try { window.speechSynthesis?.cancel(); } catch {}
}

/** Разбить текст на куски по границам предложений (длинные фразы браузеры обрезают). */
function splitForTts(text, maxLen = 220) {
  const sentences = String(text).split(/(?<=[.!?…])\s+/);
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + ' ' + s).length > maxLen) { chunks.push(cur.trim()); cur = s; }
    else cur = cur ? cur + ' ' + s : s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [String(text)];
}

/**
 * Озвучить текст голосом из настроек навигатора.
 * Предыдущая озвучка отменяется. onEnd вызывается когда договорил/отменили/ошибка.
 */
export function speakText(text, { onEnd } = {}) {
  stopSpeak();
  const done = () => { try { onEnd?.(); } catch {} };
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) { done(); return false; }
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('karta_nav_settings') || '{}'); } catch {}
    if (cfg.voice_enabled === false) { done(); return false; }
    const clean = String(text).replace(/[#*`_>|]/g, '').trim().slice(0, 800);
    if (!clean) { done(); return false; }
    const langMap = { ru: 'ru-RU', tg: 'tg-TJ', en: 'en-US' };
    const wantLang = langMap[cfg.voice_language] || 'ru-RU';
    let voice = null;
    try {
      const vs = synth.getVoices?.() || [];
      const prefix = wantLang.split('-')[0].toLowerCase();
      voice = (cfg.voice_uri && vs.find(v => v.voiceURI === cfg.voice_uri))
        || vs.find(v => (v.lang || '').toLowerCase().startsWith(prefix))
        || vs.find(v => (v.lang || '').toLowerCase().startsWith('ru'))
        || null;
    } catch {}
    const token = ++ttsToken;
    const chunks = splitForTts(clean);
    let i = 0;
    const next = () => {
      if (token !== ttsToken) return; // отменили
      if (i >= chunks.length) { done(); return; }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = voice?.lang || wantLang;
      if (voice) u.voice = voice;
      u.rate = 1.05;
      if (typeof cfg.voice_volume === 'number') u.volume = Math.max(0, Math.min(1, cfg.voice_volume));
      u.onend = next;
      u.onerror = () => { if (token === ttsToken) done(); };
      synth.speak(u);
    };
    next();
    return true;
  } catch {
    done();
    return false;
  }
}
