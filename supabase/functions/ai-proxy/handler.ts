// handler.ts — вся логика ai-proxy на чистом TypeScript без Deno-глобалов.
// Тонкая обвязка Deno (env, Supabase, fetch, serve) — в index.ts.
// Тестируется из src/test/aiProxyHandler.test.ts (vitest).
//
// Контракт с фронтом (src/lib/aiModels.js) не менялся:
//   GET  ?action=models → { success, models:[{id,name,prompt,completion}] }
//   POST ?action=chat   → { success, text, model, free } | { success:false, error:{code,message,...} }
// Коды ошибок: unauthorized | paid_model | unknown_model | bad_request |
//              payload_too_large | no_server_key | ratelimit |
//              upstream_error | openrouter_error | internal
//
// Безопасность:
//   - ключ OpenRouter живёт только в серверном env (deps.env) и никогда
//     не попадает в ответы/логи;
//   - платные модели разрешены ТОЛЬКО при серверном флаге
//     OPENROUTER_PAID_ALLOWED=true (по умолчанию — запрещены: allowPaid
//     из тела запроса не даёт тратить кредиты владельца ключа);
//   - входные данные валидируются (роли, размеры), внутренние ошибки
//     не раскрываются клиенту.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const OR_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OR_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const REFERER = "https://karta-ad.app";
const X_TITLE = "Karta-AD";

export const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
export const MAX_CHAT_PER_MIN_PER_USER = 20;
export const MAX_MESSAGES = 20;
export const MAX_CONTENT_CHARS = 32_000;
export const MAX_TOTAL_CHARS = 80_000;
export const MODEL_ID_MAX_CHARS = 120;

const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

// ─── типы ─────────────────────────────────────────────────────────────

export type ChatLogEntry = {
  user_id: string | null;
  model: string;
  is_free: boolean;
  fallback_of: string | null;
  prompt_chars: number;
  completion_chars: number;
  upstream_status: number | null;
  outcome: string;
  proxy_error_code?: string;
};

export type RateLimiter = {
  check(key: string, now: number): { ok: boolean; retryAfterMs: number };
};

export interface ProxyDeps {
  env(name: string): string | undefined;
  fetchImpl: typeof fetch;
  getUser(jwt: string): Promise<string | null>;
  logUsage(entry: ChatLogEntry): void;
  now?(): number;
  rateLimiter?: RateLimiter;
}

export type NormalizedChat = {
  model: string;
  messages: { role: string; content: string }[];
  maxTokens: number;
  temperature: number;
  allowPaid: boolean;
  fallbackOf: string | null;
};

type NormalizeResult = {
  ok: boolean;
  value: NormalizedChat | null;
  status: number;
  code: string;
  message: string;
};

// ─── чистые помощники ────────────────────────────────────────────────

export function isFreePricing(pricing: unknown): boolean {
  if (!pricing || typeof pricing !== "object") return false;
  const p = pricing as { prompt?: unknown; completion?: unknown };
  const prompt = parseFloat(String(p.prompt ?? "1"));
  const completion = parseFloat(String(p.completion ?? "1"));
  return Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
}

export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, number[]>();
  return {
    check(key: string, now: number) {
      const fresh = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
      if (fresh.length >= max) {
        buckets.set(key, fresh);
        return { ok: false, retryAfterMs: Math.max(0, windowMs - (now - fresh[0])) };
      }
      fresh.push(now);
      buckets.set(key, fresh);
      return { ok: true, retryAfterMs: 0 };
    },
  };
}

function clampNumber(v: unknown, min: number, max: number, dflt: number, round: boolean): number {
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isFinite(n)) return dflt;
  const clamped = Math.min(max, Math.max(min, n));
  return round ? Math.round(clamped) : clamped;
}

function fail(status: number, code: string, message: string): NormalizeResult {
  return { ok: false, value: null, status, code, message };
}

/** Валидация тела chat-запроса: схема, роли, размеры, клампы чисел. */
export function normalizeChatBody(raw: unknown): NormalizeResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail(400, "bad_request", "Тело запроса должно быть JSON-объектом");
  }
  const body = raw as Record<string, unknown>;

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model || model.length > MODEL_ID_MAX_CHARS) {
    return fail(400, "bad_request", `Поле model обязательно (непустая строка до ${MODEL_ID_MAX_CHARS} символов)`);
  }

  const rawMessages = body.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return fail(400, "bad_request", "messages должен быть непустым массивом");
  }

  const messages: { role: string; content: string }[] = [];
  let totalChars = 0;
  for (const item of rawMessages.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return fail(400, "bad_request", "Каждое сообщение — объект {role, content}");
    }
    const m = item as Record<string, unknown>;
    const role = typeof m.role === "string" ? m.role : "";
    const content = typeof m.content === "string" ? m.content : null;
    if (!ALLOWED_ROLES.has(role) || content === null) {
      return fail(400, "bad_request", "role ∈ {system,user,assistant}, content — строка");
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return fail(413, "payload_too_large", `Одно сообщение больше ${MAX_CONTENT_CHARS} символов`);
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return fail(413, "payload_too_large", `Суммарный объём сообщений больше ${MAX_TOTAL_CHARS} символов`);
    }
    messages.push({ role, content });
  }

  return {
    ok: true,
    value: {
      model,
      messages,
      maxTokens: clampNumber(body.max_tokens, 256, 16000, 8000, true),
      temperature: clampNumber(body.temperature, 0, 2, 0.7, false),
      allowPaid: body.allowPaid === true,
      fallbackOf: typeof body.fallbackOf === "string" ? body.fallbackOf.slice(0, 200) : null,
    },
    status: 200,
    code: "",
    message: "",
  };
}

// ─── HTTP-помощники ──────────────────────────────────────────────────

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Один глобальный лимитер на изоляцию — как в прежнем index.ts.
const defaultLimiter = createRateLimiter(MAX_CHAT_PER_MIN_PER_USER, 60 * 1000);

// Кэш каталога моделей (TTL 5 минут) — как в прежнем index.ts.
let modelsCache: { ts: number; models: { id: string; name: string; pricing: unknown }[] } | null = null;

/** Только для тестов: сбросить кэш каталога моделей. */
export function __resetModelsCacheForTests(): void {
  modelsCache = null;
}

async function fetchUpstreamModels(deps: ProxyDeps) {
  const now = (deps.now ?? Date.now)();
  if (modelsCache && now - modelsCache.ts < MODELS_CACHE_TTL_MS) return modelsCache.models;
  const key = deps.env("OPENROUTER_API_KEY") ?? "";
  const resp = await deps.fetchImpl(OR_MODELS_URL, {
    headers: { Authorization: `Bearer ${key}`, "HTTP-Referer": REFERER, "X-Title": X_TITLE },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`upstream models ${resp.status}`);
  const data = (await resp.json()) as { data?: { id: string; name: string; pricing: unknown }[] };
  const models = Array.isArray(data?.data) ? data.data : [];
  modelsCache = { ts: now, models };
  return models;
}

// ─── обработчики ─────────────────────────────────────────────────────

async function handleModels(deps: ProxyDeps): Promise<Response> {
  const key = deps.env("OPENROUTER_API_KEY") ?? "";
  if (!key) return json(503, { success: false, error: { code: "no_server_key", message: "Серверный AI-ключ не настроен" } });
  try {
    const upstream = await fetchUpstreamModels(deps);
    const models = upstream
      .filter((m) => isFreePricing(m.pricing))
      .map((m) => ({
        id: m.id,
        name: m.name,
        prompt: String((m.pricing as { prompt?: unknown })?.prompt ?? ""),
        completion: String((m.pricing as { completion?: unknown })?.completion ?? ""),
      }))
      .slice(0, 60);
    return json(200, { success: true, models });
  } catch {
    // Детали upstream — только в серверный лог, клиенту обезличенно.
    console.error("[ai-proxy] models upstream failed");
    return json(502, {
      success: false,
      error: { code: "upstream_error", message: "Каталог моделей временно недоступен" },
    });
  }
}

async function handleChat(req: Request, userId: string, deps: ProxyDeps): Promise<Response> {
  const limiter = deps.rateLimiter ?? defaultLimiter;
  const rl = limiter.check(userId, (deps.now ?? Date.now)());
  if (!rl.ok) {
    return json(429, {
      success: false,
      error: {
        code: "ratelimit",
        message: "Слишком много запросов. Подожди минуту.",
        retry_after: Math.ceil(rl.retryAfterMs / 1000),
      },
    });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json(400, { success: false, error: { code: "bad_request", message: "Некорректный JSON" } });
  }

  const norm = normalizeChatBody(parsed);
  if (!norm.ok) {
    return json(norm.status, { success: false, error: { code: norm.code, message: norm.message } });
  }
  const body = norm.value as NormalizedChat;

  const key = deps.env("OPENROUTER_API_KEY") ?? "";
  if (!key) return json(503, { success: false, error: { code: "no_server_key", message: "Серверный AI-ключ не настроен" } });

  // Известные модели — только каталог upstream (бесплатные и платные).
  let known: Set<string>;
  try {
    known = new Set((await fetchUpstreamModels(deps)).map((m) => m.id));
  } catch {
    console.error("[ai-proxy] models lookup failed");
    known = new Set();
  }
  if (!known.has(body.model)) {
    return json(404, { success: false, error: { code: "unknown_model", message: "Модель не найдена в каталоге" } });
  }

  // Платные модели — только с серверного разрешения (не из тела запроса).
  const isFree = await isModelFree(body.model, deps);
  const paidAllowed = deps.env("OPENROUTER_PAID_ALLOWED") === "true";
  if (!isFree && !(body.allowPaid && paidAllowed)) {
    deps.logUsage({
      user_id: userId, model: body.model, is_free: false, fallback_of: body.fallbackOf,
      prompt_chars: 0, completion_chars: 0, upstream_status: null,
      outcome: "denied_paid", proxy_error_code: "paid_model",
    });
    return json(402, {
      success: false,
      error: {
        code: "paid_model",
        free: false,
        message: paidAllowed
          ? "Платная модель. Требуется подтверждение в интерфейсе."
          : "Платные модели отключены на сервере.",
      },
    });
  }

  const promptChars = body.messages.reduce((n, m) => n + m.content.length, 0);

  try {
    const resp = await deps.fetchImpl(OR_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": REFERER,
        "X-Title": X_TITLE,
      },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        max_tokens: body.maxTokens,
        temperature: body.temperature,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      const j = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
      deps.logUsage({
        user_id: userId, model: body.model, is_free: isFree, fallback_of: body.fallbackOf,
        prompt_chars: promptChars, completion_chars: 0, upstream_status: resp.status,
        outcome: "error", proxy_error_code: `upstream_${resp.status}`,
      });
      if (resp.status === 401 || resp.status === 403) {
        return json(502, {
          success: false,
          error: { code: "openrouter_error", message: "Ключ сервера недействителен. Обратись к администратору." },
        });
      }
      if (resp.status === 402) {
        return json(502, { success: false, error: { code: "openrouter_error", message: "Недостаточно средств у AI-провайдера." } });
      }
      if (resp.status === 429) {
        return json(429, { success: false, error: { code: "ratelimit", message: "Лимит AI-провайдера, попробуй позже." } });
      }
      // Текст ошибки upstream — усечённый и без каких-либо секретов.
      const upstreamMsg = String(j?.error?.message ?? "").slice(0, 300);
      return json(502, {
        success: false,
        error: { code: "openrouter_error", message: upstreamMsg || `Ошибка OpenRouter ${resp.status}` },
      });
    }

    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data?.choices?.[0]?.message?.content ?? "";
    deps.logUsage({
      user_id: userId, model: body.model, is_free: isFree, fallback_of: body.fallbackOf,
      prompt_chars: promptChars, completion_chars: text.length, upstream_status: resp.status,
      outcome: "ok",
    });
    return json(200, { success: true, text, model: body.model, free: isFree });
  } catch (e) {
    // Транспортная ошибка — детали только в серверный лог.
    console.error("[ai-proxy] chat fetch failed:", e instanceof Error ? e.message : String(e));
    deps.logUsage({
      user_id: userId, model: body.model, is_free: isFree, fallback_of: body.fallbackOf,
      prompt_chars: promptChars, completion_chars: 0, upstream_status: null,
      outcome: "error", proxy_error_code: "fetch_failed",
    });
    return json(502, {
      success: false,
      error: { code: "openrouter_error", message: "Связь с AI-провайдером прервалась. Попробуй позже." },
    });
  }
}

async function isModelFree(model: string, deps: ProxyDeps): Promise<boolean> {
  try {
    const upstream = await fetchUpstreamModels(deps);
    const m = upstream.find((x) => x.id === model);
    return isFreePricing(m?.pricing);
  } catch {
    return false;
  }
}

// ─── точка входа ─────────────────────────────────────────────────────

export async function handleRequest(req: Request, deps: ProxyDeps): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";

    // Авторизация обязательна для всех действий.
    const jwt = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    const userId = await deps.getUser(jwt);
    if (!userId) {
      return json(401, { success: false, error: { code: "unauthorized", message: "Требуется вход" } });
    }

    if (req.method === "GET" && action === "models") return handleModels(deps);
    if (req.method === "POST" && action === "chat") return handleChat(req, userId, deps);

    return json(404, { success: false, error: { code: "not_found", message: "Неизвестное действие" } });
  } catch (e) {
    // Внутренности — только в серверный лог; клиенту обезличенно.
    console.error("[ai-proxy] internal error:", e instanceof Error ? e.message : String(e));
    return json(500, { success: false, error: { code: "internal", message: "Внутренняя ошибка" } });
  }
}
