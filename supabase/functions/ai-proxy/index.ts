import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleRequest, corsHeaders } from "./handler.ts";

// ─── AI-proxy: backend для OpenRouter ─────────────────────────
// Ключ OPENROUTER_API_KEY живёт ТОЛЬКО здесь (Edge Function secret).
// Вся логика и валидация — в handler.ts (покрыта тестами в vitest).
// Логи — в ai_logs (без секретов и без текстов переписки).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const admin = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

/** Проверка JWT через Supabase Auth. Возвращает user id или null. */
async function getUserFromJwt(jwt: string): Promise<string | null> {
  if (!jwt || !SUPABASE_ANON_KEY) return null;
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data, error } = await client.auth.getUser();
    return error ? null : (data.user?.id ?? null);
  } catch {
    return null;
  }
}

/** Асинхронная запись лога (fire-and-forget, без секретов). */
function logUsage(entry: {
  user_id: string | null;
  model: string;
  is_free: boolean;
  fallback_of: string | null;
  prompt_chars: number;
  completion_chars: number;
  upstream_status: number | null;
  outcome: string;
  proxy_error_code?: string;
}): void {
  if (!admin) return;
  admin
    .from("ai_logs")
    .insert(entry)
    .then(({ error }) => {
      if (error) console.error("ai_logs insert error:", error.message);
    });
}

serve(async (req) => {
  const response = await handleRequest(req, {
    env: (name) => Deno.env.get(name),
    fetchImpl: fetch,
    getUser: getUserFromJwt,
    logUsage,
  });
  // Для OPTIONS-предварительных запросов CORS уже в corsHeaders.
  return response;
});

export { isFreePricing } from "./handler.ts";
export { corsHeaders };
