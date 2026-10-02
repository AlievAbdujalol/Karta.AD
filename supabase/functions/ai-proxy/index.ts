import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── AI-proxy: backend для OpenRouter ─────────────────────────
// Ключ OPENROUTER_API_KEY живёт ТОЛЬКО здесь (Edge Function secret).
// Фронт ходит только сюда: ?action=models (GET) и ?action=chat (POST).
// Логи — в ai_logs (без секретов и без текстов переписки).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OR_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OR_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OR_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CHAT_PER_MIN_PER_USER = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── upstream models cache (память isolate) ───────────────────
let modelsCache: { at: number; raw: any[] } | null = null;

// ─── rate limit per user ──────────────────────────────────────
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, max: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60000 });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > max) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

// ─── auth: JWT пользователя ───────────────────────────────────
async function getUserId(req: Request): Promise<string | null> {
  try {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await anon.auth.getUser(m[1]);
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── free check: нулевые цены prompt+completion ───────────────
export function isFreePricing(pricing: any): boolean {
  if (!pricing) return false;
  const p = parseFloat(pricing.prompt ?? "1");
  const c = parseFloat(pricing.completion ?? "1");
  return Number.isFinite(p) && Number.isFinite(c) && p === 0 && c === 0;
}

function toSafeModel(m: any) {
  return {
    id: String(m.id ?? ""),
    name: String(m.name ?? m.id ?? ""),
    description: String(m.description ?? "").slice(0, 300),
    context_length: Number(m.context_length ?? m.top_provider?.context_length ?? 0) || 0,
    modality: String(m.architecture?.modality ?? ""),
    pricing: {
      prompt: String(m.pricing?.prompt ?? ""),
      completion: String(m.pricing?.completion ?? ""),
    },
  };
}

async function fetchUpstreamModels(): Promise<{ models: any[]; cached: boolean }> {
  const now = Date.now();
  if (modelsCache && now - modelsCache.at < MODELS_CACHE_TTL_MS) {
    return { models: modelsCache.models, cached: true };
  }
  if (!OR_KEY) throw new Error("NO_SERVER_KEY");
  const resp = await fetch(OR_MODELS_URL, {
    headers: { Authorization: "Bearer " + OR_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error("UPSTREAM_" + resp.status);
  const data = await resp.json();
  const raw = Array.isArray(data?.data) ? data.data : [];
  modelsCache = { at: now, raw };
  return { models: raw, cached: false };
}

function logUsage(entry: {
  user_id: string | null; model: string; ok: boolean; status: number;
  ms: number; fallback: boolean; error_code: string | null; prompt_chars: number;
}) {
  try {
    // fire-and-forget, без await — журнал не должен тормозить ответ
    (supabaseAdmin.from("ai_logs") as any).insert(entry).then(
      () => {},
      () => {},
    );
  } catch { /* ignore */ }
}

// ─── handlers ─────────────────────────────────────────────────
async function handleModels(req: Request, userId: string | null) {
  if (!OR_KEY) return json({ success: false, error: { code: "no_server_key", message: "OPENROUTER_API_KEY не задан на сервере" } }, 503);
  try {
    const { models, cached } = await fetchUpstreamModels();
    const free = models.filter((m) => isFreePricing(m.pricing)).map(toSafeModel);
    return json({ success: true, models: free, cached, updated_at: new Date().toISOString() });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return json({ success: false, error: { code: "upstream_error", message: msg } }, 502);
  }
}

async function handleChat(req: Request, userId: string) {
  const rl = rateLimit("chat:" + userId, MAX_CHAT_PER_MIN_PER_USER);
  if (!rl.ok) {
    return json({ success: false, error: { code: "rate_limited", message: "Слишком часто. Подожди немного.", retry_after: rl.retryAfter } }, 429);
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: { code: "bad_request", message: "Нужно JSON-тело" } }, 400);
  }
  const model = String(body?.model ?? "").trim();
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-20) : null;
  const maxTokens = Math.min(Math.max(Number(body?.max_tokens ?? 4000) || 4000, 256), 16000);
  const temperature = Math.min(Math.max(Number(body?.temperature ?? 0.7), 0), 2);
  const allowPaid = body?.allowPaid === true;
  const fallbackOf = typeof body?.fallbackOf === "string" ? body.fallbackOf.slice(0, 200) : null;
  if (!model || !messages) {
    return json({ success: false, error: { code: "bad_request", message: "Нужны model и messages" } }, 400);
  }
  if (!OR_KEY) return json({ success: false, error: { code: "no_server_key", message: "OPENROUTER_API_KEY не задан на сервере" } }, 503);

  // Проверка модели по актуальному списку (не доверяем клиенту)
  let freeIds = new Set<string>();
  let knownIds = new Set<string>();
  try {
    const { models } = await fetchUpstreamModels();
    for (const m of models) {
      const id = String((m as any)?.id ?? "");
      if (!id) continue;
      knownIds.add(id);
      if (isFreePricing((m as any)?.pricing)) freeIds.add(id);
    }
  } catch {
    return json({ success: false, error: { code: "upstream_error", message: "Не удалось проверить модель" } }, 502);
  }
  const isFree = freeIds.has(model);
  if (!isFree && !allowPaid) {
    return json({ success: false, error: { code: "paid_model", message: "Модель платная. Требуется подтверждение.", free: false } }, 402);
  }
  if (!knownIds.has(model)) {
    return json({ success: false, error: { code: "unknown_model", message: "Модель " + model + " неизвестна" } }, 404);
  }

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(OR_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OR_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://karta-ad.app",
        "X-Title": "Karta-AD Business",
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    logUsage({ user_id: userId, model, ok: false, status: 0, ms: Date.now() - t0, fallback: !!fallbackOf, error_code: "network", prompt_chars: JSON.stringify(messages).length });
    return json({ success: false, error: { code: "network", message: "OpenRouter недоступен" } }, 502);
  }
  const ms = Date.now() - t0;
  if (upstream.status === 429) {
    const ra = Number(upstream.headers.get("retry-after") ?? 0) || 0;
    logUsage({ user_id: userId, model, ok: false, status: 429, ms, fallback: !!fallbackOf, error_code: "ratelimit", prompt_chars: JSON.stringify(messages).length });
    return json({ success: false, error: { code: "ratelimit", message: "Лимит модели, пробую другую", retry_after: ra } }, 429);
  }
  if (!upstream.ok) {
    const code = upstream.status === 402 ? "credits" : upstream.status === 404 ? "unknown_model" : "upstream_error";
    logUsage({ user_id: userId, model, ok: false, status: upstream.status, ms, fallback: !!fallbackOf, error_code: code, prompt_chars: JSON.stringify(messages).length });
    return json({ success: false, error: { code, message: "OpenRouter: HTTP " + upstream.status } }, upstream.status === 402 ? 402 : 502);
  }
  let data: any;
  try {
    data = await upstream.json();
  } catch {
    return json({ success: false, error: { code: "upstream_error", message: "Некорректный ответ модели" } }, 502);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    logUsage({ user_id: userId, model, ok: false, status: 200, ms, fallback: !!fallbackOf, error_code: "empty", prompt_chars: JSON.stringify(messages).length });
    return json({ success: false, error: { code: "empty", message: "Пустой ответ модели" } }, 502);
  }
  logUsage({ user_id: userId, model, ok: true, status: 200, ms, fallback: !!fallbackOf, error_code: null, prompt_chars: JSON.stringify(messages).length });
  return json({ success: true, text: String(text), model, free: isFree });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";
    const userId = await getUserId(req);
    if (!userId) return json({ success: false, error: { code: "unauthorized", message: "Войди в аккаунт" } }, 401);
    if (req.method === "GET" && action === "models") return await handleModels(req, userId);
    if (req.method === "POST" && action === "chat") return await handleChat(req, userId);
    return json({ success: false, error: { code: "bad_request", message: "action=models (GET) | action=chat (POST)" } }, 400);
  } catch (e) {
    return json({ success: false, error: { code: "internal", message: String((e as Error)?.message ?? e) } }, 500);
  }
});
