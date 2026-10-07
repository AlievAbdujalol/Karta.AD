/**
 * openrouter.js — клиент OpenRouter (OpenAI-совместимый Chat Completions).
 * Ключ: VITE_OPENROUTER_API_KEY (.env.local, не коммитить).
 * ВНИМАНИЕ: ключ во фронтенде виден в devtools — для продакшена
 * проксируйте через Edge Function (как и VITE_GEMINI_API_KEY).
 */

const API_BASE = 'https://openrouter.ai/api/v1';

import { getApiKey as getUserApiKey } from './userKeys';

export const OPENROUTER_MODELS = [
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini · быстро и дёшево' },
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash · быстро' },
  { id: 'anthropic/claude-3-5-haiku', label: 'Claude 3.5 Haiku · аккуратный код' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B · бесплатно' },
];

export const DEFAULT_MODEL = 'openai/gpt-4o-mini';

// Приоритет: личный ключ пользователя (Профиль → AI-ключи) → общий из .env
export function getOpenRouterKey() {
  return getUserApiKey('openrouter', import.meta.env?.VITE_OPENROUTER_API_KEY);
}

export function isOpenRouterConfigured() {
  return !!getOpenRouterKey();
}

export class OpenRouterError extends Error {
  constructor(type, message) {
    super(message);
    this.type = type;
  }
}

/**
 * Проверка ключа через GET /api/v1/auth/key (не тратит кредиты).
 * Возвращает { ok: true, label } или { ok: false, reason }.
 */
export async function validateOpenRouterKey(key) {
  const clean = (key || '').trim();
  if (!clean) return { ok: false, reason: 'Пустой ключ' };
  if (!clean.startsWith('sk-or-v1-')) {
    return { ok: false, reason: 'Ключ должен начинаться с sk-or-v1- — скопируй целиком' };
  }
  try {
    const resp = await fetch(`${API_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${clean}` },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, reason: 'OpenRouter отклонил ключ — скопируй заново целиком' };
    }
    if (!resp.ok) return { ok: false, reason: `OpenRouter: HTTP ${resp.status}` };
    const data = await resp.json().catch(() => ({}));
    return { ok: true, label: data?.data?.label || '' };
  } catch {
    return { ok: false, reason: 'network', message: 'Нет связи — ключ не проверен' };
  }
}

/**
 * Chat completions. Возвращает текст первого choice или бросает OpenRouterError.
 */
export async function openRouterChat(
  messages,
  { model = DEFAULT_MODEL, temperature = 0.7, maxTokens = 6000, timeoutMs = 90000 } = {},
) {
  const key = getOpenRouterKey();
  if (!key) throw new OpenRouterError('auth', 'Нет API-ключа: добавь свой в Профиль → AI-ключи');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Karta-AD Business',
      },
      body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages }),
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new OpenRouterError('auth', 'Ключ отклонён (401/403) — скопируй ключ заново целиком с openrouter.ai/keys');
    }
    if (resp.status === 402) {
      throw new OpenRouterError('credits', 'На счету OpenRouter нет кредитов — пополни баланс на openrouter.ai');
    }
    if (resp.status === 404) {
      throw new OpenRouterError('model', `Модель ${model} недоступна — выбери другую`);
    }
    if (resp.status === 429) {
      throw new OpenRouterError('rate', 'Лимит OpenRouter исчерпан, подожди');
    }
    if (!resp.ok) {
      throw new OpenRouterError('http', `OpenRouter: HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new OpenRouterError('empty', 'Пустой ответ модели');
    return String(text);
  } catch (e) {
    if (e instanceof OpenRouterError) throw e;
    if (e?.name === 'AbortError') throw new OpenRouterError('timeout', 'Превышено время ожидания');
    throw new OpenRouterError('network', 'Ошибка сети');
  } finally {
    clearTimeout(timer);
  }
}

// ─── Генерация сайта ─────────────────────────────────────────

const SITE_SYSTEM = (biz) => `Ты — веб-разработчик. Генерируешь ОДНОФАЙЛОВЫЙ сайт (single HTML file).
Бизнес: «${biz.name || 'Бизнес'}», тип: ${biz.type || 'магазин'}, город: ${biz.city || ''}, адрес: ${biz.address || ''}, телефон: ${biz.phone || ''}.
Товары: ${(biz.products || []).slice(0, 12).map((p) => `${p.name} — ${p.price} сом`).join('; ') || 'нет'}.

СТРОГИЕ ПРАВИЛА ВЫВОДА:
- Верни ТОЛЬКО готовый HTML-код, без объяснений и без markdown-обёртки (никаких \`\`\`).
- Всё инлайн: <style> в <head>, <script> в конце <body>. Никаких внешних CSS/JS.
- Картинки: только CSS-градиенты и emoji — никаких внешних URL.
- Адаптив: mobile-first, viewport, крупные кнопки.
- Язык контента: русский. Шапка с названием, hero, каталог товаров с ценами, контакты (адрес, телефон tel:-ссылка), подвал.
- Размер: до ~25 КБ.`;

const SITE_EDIT_SYSTEM = `Ты — веб-разработчик. Тебе дают ТЕКУЩИЙ однофайловый HTML сайт и правку пользователя.
Верни ПОЛНЫЙ обновлённый HTML-код целиком, только код без объяснений и markdown-обёртки.
Сохрани всё, что не касается правки. Всё инлайн, без внешних CSS/JS/картинок.`;

/** Извлечь HTML из ответа (убрать markdown-обёртку если есть). */
export function extractHtml(raw) {
  let s = String(raw || '').trim();
  const m = s.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  if (m) s = m[1].trim();
  const i = s.search(/<(!doctype|html)/i);
  if (i > 0) s = s.slice(i);
  return s;
}

/** Сообщения для генерации сайта (переиспользуются backend-путём). */
export function buildSiteMessages(biz, prompt) {
  return [
    { role: 'system', content: SITE_SYSTEM(biz) },
    { role: 'user', content: `Опиши и создай сайт: ${prompt}` },
  ];
}

/** Сообщения для доработки сайта (переиспользуются backend-путём). */
export function buildEditMessages(html, prompt) {
  return [
    { role: 'system', content: SITE_EDIT_SYSTEM },
    { role: 'user', content: `ТЕКУЩИЙ САЙТ:\n${html.slice(0, 20000)}\n\nПРАВКА: ${prompt}` },
  ];
}

/** Сгенерировать сайт с нуля по описанию. */
export async function generateSite(biz, prompt, { model } = {}) {
  const raw = await openRouterChat(buildSiteMessages(biz, prompt), {
    model: model || DEFAULT_MODEL, temperature: 0.7, maxTokens: 8000, timeoutMs: 120000,
  });
  return extractHtml(raw);
}

/** Доработать существующий HTML по правке пользователя. */
export async function editSite(html, prompt, { model } = {}) {
  const raw = await openRouterChat(buildEditMessages(html, prompt), {
    model: model || DEFAULT_MODEL, temperature: 0.5, maxTokens: 8000, timeoutMs: 120000,
  });
  return extractHtml(raw);
}

// ─── AI-модули для импортированных сайтов ─────────────────────
export const SITE_MODULES = [
  { id: 'cart', icon: '🛒', label: 'Корзина и заказы' },
  { id: 'contacts', icon: '📞', label: 'Контакты бизнеса' },
  { id: 'dark', icon: '🎨', label: 'Тёмная тема' },
  { id: 'db', icon: '🗄️', label: 'База данных' },
  { id: 'delivery', icon: '🚚', label: 'Доставка' },
  { id: 'payment', icon: '💳', label: 'Оплата' },
];

/** Промпт подключения модуля к чужому HTML. */
export function buildModuleMessages(html, moduleId, ctx = {}) {
  const base = `Бизнес: «${ctx.businessName || ''}», телефон: ${ctx.phone || ''}, адрес: ${[ctx.city, ctx.address].filter(Boolean).join(', ') || ''}.
Товары: ${(ctx.products || []).slice(0, 12).map((p) => `${p.name} — ${p.price} сом`).join('; ') || 'нет'}.`;
  const tasks = {
    cart: `Добавь корзину и оформление заказа. Товары на сайте (кнопки/карточки) сделай добавляемыми в корзину (localStorage или переменная). Добавь липкую панель корзины с суммой и форму: имя, телефон, адрес, доставка/самовывоз. Отправка заказа: POST ${ctx.supabaseUrl}/rest/v1/rpc/create_store_order с заголовками apikey и Authorization: Bearer ${ctx.anonKey} (это публичный anon-ключ, так и нужно), тело: {p_business_id:"${ctx.businessId}", p_items:[{product_id, quantity}], p_customer:{name, phone, notes:""}, p_delivery:{type:"delivery|pickup", address, lat, lng}, p_payment_method:"cash"}. Цены и total НЕ передавай — сервер возьмёт их из каталога и вернёт {order_id, total, delivery_cost}. Покажи номер заказа из ответа. Всё инлайн, без внешних библиотек.`,
    contacts: `Добавь или обнови блок контактов: название «${ctx.businessName || ''}», телефон ссылкой tel:, кнопка WhatsApp https://wa.me/<цифры телефона>, адрес.`,
    dark: `Сделай тёмную тему сайта (тёмный фон, светлый текст), сохранив структуру и контент.`,
    db: `Подключи базу данных Karta-AD (Supabase): корзина и оформление заказа как в задаче корзины — POST ${ctx.supabaseUrl}/rest/v1/rpc/create_store_order (apikey + Authorization: Bearer ${ctx.anonKey}), тело {p_business_id:"${ctx.businessId}", p_items:[{product_id, quantity}], p_customer:{name, phone, notes:""}, p_delivery:{type:"delivery|pickup", address, lat, lng}, p_payment_method:"cash"}; цены не отправляй, сервер вернёт {order_id, total, delivery_cost}. Товары бери с витрины. Покажи номер заказа. Всё инлайн, без внешних библиотек.`,
    delivery: `Добавь блок «Доставка Karta-AD»: варианты доставки/самовывоз (radio), поле адреса, выбор влияет на поле delivery_type заказа (delivery/pickup). Стиль — как остальной сайт, всё инлайн.`,
    payment: `Добавь блок оплаты: варианты «Наличными», «Картой курьеру», «Переводом» (radio) + поле комментария; выбранный способ сохраняй в примечание заказа (notes). Онлайн-эквайринг подключается позже отдельно — оставь пометку в коде.`,
  };
  const task = tasks[moduleId] || String(moduleId);
  return [
    { role: 'system', content: SITE_EDIT_SYSTEM },
    { role: 'user', content: `${base}\n\nЗАДАЧА: ${task}\n\nТЕКУЩИЙ САЙТ:\n${html.slice(0, 20000)}` },
  ];
}

// ─── Правки мультифайлового проекта (diff-JSON) ──────────────

const FILE_EDIT_SYSTEM = `Ты — веб-разработчик. Дан список файлов проекта и их содержимое. Верни СТРОГО JSON:
{"edits":[{"op":"create|update|delete|rename","path":"...","to":"...","content":"..."}]}
Правила: меняй только то, чего касается правка; create — только новые пути; content — полный новый текст файла; без объяснений и markdown.`;

export function buildFileEditMessages(tree, files, prompt) {
  const listing = tree.join('\n');
  const packed = Object.entries(files)
    .map(([p, c]) => `--- ${p} ---\n${String(c).slice(0, 6000)}`)
    .join('\n')
    .slice(0, 16000);
  return [
    { role: 'system', content: FILE_EDIT_SYSTEM },
    { role: 'user', content: `ФАЙЛЫ:\n${listing}\n\nСОДЕРЖИМОЕ:\n${packed}\n\nПРАВКА: ${prompt}` },
  ];
}

/** Промпт модуля для мультифайлового проекта (тот же diff-JSON формат). */
export function buildFileModuleMessages(tree, files, moduleId, ctx = {}) {
  const names = {
    cart: 'корзину и оформление заказа',
    contacts: 'блок контактов бизнеса',
    dark: 'тёмную тему',
    db: 'подключение базы данных Karta-AD (корзина → заказы)',
    delivery: 'блок доставки Karta-AD',
    payment: 'блок оплаты',
  };
  const base = `Бизнес: «${ctx.businessName || ''}», телефон: ${ctx.phone || ''}, адрес: ${[ctx.city, ctx.address].filter(Boolean).join(', ') || ''}.`;
  const details = {
    cart: `Добавь корзину и оформление заказа с отправкой: POST ${ctx.supabaseUrl}/rest/v1/rpc/create_store_order (apikey + Authorization: Bearer ${ctx.anonKey}), тело {p_business_id:"${ctx.businessId}", p_items:[{product_id, quantity}], p_customer:{name, phone, notes:""}, p_delivery:{type:"delivery|pickup", address, lat, lng}, p_payment_method:"cash"}; цены не отправляй — сервер вернёт {order_id, total, delivery_cost}.`,
    db: `Подключи базу данных: корзина и оформление заказа через POST ${ctx.supabaseUrl}/rest/v1/rpc/create_store_order (apikey + Authorization: Bearer ${ctx.anonKey}), тело {p_business_id:"${ctx.businessId}", p_items:[{product_id, quantity}], p_customer:{name, phone, notes:""}, p_delivery:{type:"delivery|pickup", address, lat, lng}, p_payment_method:"cash"}; цены не отправляй — сервер вернёт {order_id, total, delivery_cost}. Покажи номер заказа из ответа.`,
    delivery: `Добавь блок «Доставка Karta-AD»: radio доставка/самовывоз, поле адреса, влияет на delivery_type заказа.`,
    payment: `Добавь блок оплаты: radio «Наличными»/«Картой курьеру»/«Переводом» + комментарий; способ пиши в notes заказа. Онлайн-эквайринг — позже, оставь пометку в коде.`,
    contacts: `Добавь/обнови контакты: «${ctx.businessName || ''}», tel:, WhatsApp https://wa.me/<цифры>, адрес. Товары: ${(ctx.products || []).slice(0, 8).map((p) => `${p.name} — ${p.price}`).join('; ') || 'нет'}.`,
    dark: `Тёмная тема, структуру и контент сохранить.`,
  };
  const listing = tree.join('\n');
  const packed = Object.entries(files)
    .map(([p, c]) => `--- ${p} ---\n${String(c).slice(0, 6000)}`)
    .join('\n')
    .slice(0, 16000);
  return [
    { role: 'system', content: FILE_EDIT_SYSTEM },
    { role: 'user', content: `${base}\n\nЗАДАЧА: подключи ${names[moduleId] || moduleId}. ${details[moduleId] || ''}\nВерни СТРОГО JSON {"edits":[...]} — меняй только нужные файлы.\n\nФАЙЛЫ:\n${listing}\n\nСОДЕРЖИМОЕ:\n${packed}` },
  ];
}
