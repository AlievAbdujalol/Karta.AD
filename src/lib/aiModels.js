/**
 * aiModels.js — динамический каталог бесплатных OpenRouter-моделей.
 * Backend: Edge Function ai-proxy (?action=models|chat). Ключ только там.
 * Фолбэк: прямой OpenRouter личным ключом, если прокси недоступен.
 */
import { supabase } from '@/api/supabase';
import { getApiKey } from './userKeys';

const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

export const MODELS_TTL_MS = 10 * 60 * 1000;
export const MAX_FALLBACK_TRIES = 3;
const LS_MODELS = 'karta_ai_models';
const LS_MODEL = 'karta_ai_model';

// ─── чистые функции (покрыты тестами) ─────────────────────────

/** Бесплатна ли модель по pricing (строки "0" от OpenRouter). */
export function isFreeModel(m) {
  if (!m) return false;
  const p = m.pricing ?? m;
  const prompt = parseFloat(p?.prompt ?? '1');
  const completion = parseFloat(p?.completion ?? '1');
  return Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
}

/** Провайдер из id "vendor/name". */
export function providerOf(id) {
  return String(id || '').split('/')[0] || '';
}

/** Короткое имя из id. */
export function shortName(m) {
  const name = String(m?.name || m?.id || '');
  return name.replace(/\s*\(free\)\s*$/i, '').trim() || String(m?.id || '');
}

const CODING_RE = /(code|coder|devstral|starcoder|codestral)/i;
const REASON_RE = /(reason|r1|o1|o3|qwq|deepthink|thinking)/i;

/** Модальности/способности модели для фильтров. */
export function capabilitiesOf(m) {
  const modality = String(m?.modality || '');
  const hay = `${m?.id || ''} ${m?.name || ''} ${m?.description || ''}`;
  const vision = /image|vision/i.test(modality);
  const coding = CODING_RE.test(hay);
  const reasoning = REASON_RE.test(hay);
  return { vision, coding, reasoning, text: true };
}

/** Поиск + фильтр модальности. */
export function filterModels(list, { q = '', capability = 'all' } = {}) {
  const query = q.trim().toLowerCase();
  return (list || []).filter((m) => {
    if (query) {
      const hay = `${m.name || ''} ${m.id || ''} ${m.description || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (capability === 'all') return true;
    return !!capabilitiesOf(m)[capability];
  });
}

/** Сортировка: vision → context desc → имя. Без фаворитов. */
export function sortFreeModels(list) {
  return [...(list || [])].sort((a, b) => {
    const av = capabilitiesOf(a).vision ? 0 : 1;
    const bv = capabilitiesOf(b).vision ? 0 : 1;
    if (av !== bv) return av - bv;
    const ac = Number(a?.context_length || 0);
    const bc = Number(b?.context_length || 0);
    if (ac !== bc) return bc - ac;
    return String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || ''));
  });
}

/** Порядок fallback: выбранная первая (если есть в списке), дальше остальные. */
export function resolveFallbackOrder(selectedId, list) {
  const ids = (list || []).map((m) => m.id).filter(Boolean);
  const rest = ids.filter((id) => id !== selectedId);
  const head = selectedId && ids.includes(selectedId) ? [selectedId] : [];
  return [...head, ...rest].slice(0, MAX_FALLBACK_TRIES);
}

/** Распарсить Retry-After (сек), cap 10с чтобы не вешать UI. */
export function parseRetryAfter(v) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.ceil(n), 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── кэш каталога ────────────────────────────────────────────

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(LS_MODELS) || 'null');
  } catch {
    return null;
  }
}

function writeCache(models) {
  try {
    localStorage.setItem(LS_MODELS, JSON.stringify({ at: Date.now(), models }));
  } catch {}
}

/** Актуален ли кэш (для тестов — now инжектится). */
export function isCacheFresh(cache, now = Date.now()) {
  return !!cache && Array.isArray(cache.models) && now - cache.at < MODELS_TTL_MS;
}

// ─── proxy-вызовы ────────────────────────────────────────────

async function proxyFetch(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    const e = new Error('Войди в аккаунт');
    e.code = 'unauthorized';
    throw e;
  }
  const resp = await fetch(`${PROXY_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(130000),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data?.success) {
    const e = new Error(data?.error?.message || `Proxy: HTTP ${resp.status}`);
    e.code = data?.error?.code || 'proxy_error';
    e.status = resp.status;
    e.retryAfter = parseRetryAfter(data?.error?.retry_after);
    throw e;
  }
  return data;
}

/**
 * Список бесплатных моделей (кэш 10 мин). Возвращает { models, cached, updatedAt, viaProxy }.
 * viaProxy=true — ответ реально пришёл от backend (можно доверять статусу подключения);
 * viaProxy=false — отдан локальный кэш, про backend ничего не известно.
 * Бросает { code: 'no_server_key' } если на сервере нет ключа.
 */
export async function fetchFreeModels({ force = false } = {}) {
  if (!force) {
    const cache = readCache();
    if (isCacheFresh(cache)) {
      return { models: cache.models, cached: true, viaProxy: false, updatedAt: cache.at };
    }
  }
  const data = await proxyFetch('?action=models');
  const models = sortFreeModels(data.models || []);
  writeCache(models);
  return { models, cached: !!data.cached, viaProxy: true, updatedAt: Date.now() };
}

/** Прямой каталог из OpenRouter (публичный GET, ключ не нужен). */
export async function fetchFreeModelsDirect() {
  const resp = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const e = new Error(`OpenRouter: HTTP ${resp.status}`);
    e.code = 'upstream_error';
    throw e;
  }
  const data = await resp.json().catch(() => ({}));
  const raw = Array.isArray(data?.data) ? data.data : [];
  const models = sortFreeModels(
    raw.filter(isFreeModel).map((m) => ({
      id: String(m.id ?? ''),
      name: String(m.name ?? m.id ?? ''),
      description: String(m.description ?? '').slice(0, 300),
      context_length: Number(m.context_length ?? 0) || 0,
      modality: String(m.architecture?.modality ?? ''),
      pricing: {
        prompt: String(m.pricing?.prompt ?? ''),
        completion: String(m.pricing?.completion ?? ''),
      },
    })),
  );
  writeCache(models);
  return { models, cached: false, updatedAt: Date.now() };
}

/** Алиас по спеке: getFreeModels() возвращает только бесплатные модели. */
export const getFreeModels = fetchFreeModels;

/** Выбранная модель (persist). */
export function getSelectedModel() {
  try {
    return localStorage.getItem(LS_MODEL) || '';
  } catch {
    return '';
  }
}

export function setSelectedModel(id) {
  try {
    if (id) localStorage.setItem(LS_MODEL, id);
    else localStorage.removeItem(LS_MODEL);
  } catch {}
}

/**
 * Чат через backend. Платные модели — только с allowPaid (после confirm в UI).
 */
export async function proxyChat({ model, messages, maxTokens = 8000, temperature = 0.7, allowPaid = false, fallbackOf = null }) {
  const data = await proxyFetch('?action=chat', {
    method: 'POST',
    body: { model, messages, max_tokens: maxTokens, temperature, allowPaid, fallbackOf },
  });
  return { text: data.text, model: data.model };
}

/**
 * Чат с автоматическим fallback по бесплатным моделям (макс MAX_FALLBACK_TRIES).
 * onFallback({ from, to, reason }) — для тоста «переключился».
 * Платная модель без allowPaid — сразу ошибка, без автопроб.
 */
export async function chatWithFallback(models, { model, messages, maxTokens, temperature, allowPaid = false, onFallback }) {
  const order = resolveFallbackOrder(model, models);
  if (!order.length) {
    const e = new Error('Нет доступных бесплатных моделей');
    e.code = 'empty';
    throw e;
  }
  let lastError = null;
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    try {
      const res = await proxyChat({
        model: id,
        messages,
        maxTokens,
        temperature,
        allowPaid: i === 0 ? allowPaid : false,
        fallbackOf: i > 0 ? order[0] : null,
      });
      if (i > 0) onFallback?.({ from: order[0], to: id });
      return { ...res, switched: i > 0 };
    } catch (e) {
      lastError = e;
      // Платная без подтверждения, auth, неизвестная — дальше не пробуем
      if (['paid_model', 'unauthorized', 'unknown_model', 'bad_request', 'no_server_key'].includes(e.code)) throw e;
      if (e.code === 'ratelimit' && e.retryAfter > 0) await sleep(Math.min(e.retryAfter, 5) * 1000);
      // остальные — следующая модель
    }
  }
  throw lastError;
}

/** Прямой фолбэк личным ключом, если прокси недоступен (переходный режим). */
export function hasDirectFallback() {
  return !!getApiKey('openrouter', import.meta.env?.VITE_OPENROUTER_API_KEY);
}
