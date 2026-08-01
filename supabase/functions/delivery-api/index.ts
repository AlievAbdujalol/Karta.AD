import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_REQUESTS_PER_MIN = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, x-api-key, x-signature, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------- Rate limit (in-memory token bucket) ----------------
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): { ok: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60000 });
    return { ok: true, remaining: MAX_REQUESTS_PER_MIN - 1, retryAfter: 0 };
  }
  bucket.count++;
  if (bucket.count > MAX_REQUESTS_PER_MIN) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: MAX_REQUESTS_PER_MIN - bucket.count, retryAfter: 0 };
}

// ---------------- Helpers ----------------
function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

async function authenticate(apiKey: string) {
  if (!apiKey) return null;
  const { data, error } = await supabase
    .from("delivery_api_keys")
    .select("id, shop_name, secret, is_active, is_sandbox")
    .eq("api_key", apiKey)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;
  return data;
}

async function logRequest(apiKeyId: string | null, method: string, path: string, status: number, ms: number, ip: string, ua: string, body?: unknown) {
  try {
    await supabase.from("delivery_api_logs").insert({
      api_key_id: apiKeyId,
      method,
      path,
      status,
      ms,
      ip,
      user_agent: ua,
      body: body ?? null,
    });
  } catch { /* журнал не должен ломать запрос */ }
}

async function queueWebhookEvent(apiKeyId: string, orderId: string, event: string, payload: unknown) {
  // Вставка в delivery_webhook_events (status pending) — отправку выполняет триггер через pg_net
  try {
    const { error } = await supabase.rpc("queue_delivery_webhooks", {
      p_order_id: orderId,
      p_event: event,
      p_payload: payload,
    });
    if (error) console.error("queueWebhookEvent:", error.message);
  } catch (err) { console.error("queueWebhookEvent:", err); }
}

// ---------------- Handler ----------------
serve(async (req: Request) => {
  const start = Date.now();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ua = req.headers.get("user-agent") || "";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/functions\/v1\/delivery-api/, "")
    .replace(/^\/delivery-api/, "");

  try {
    // ---------- Health ----------
    if (path === "/health" || path === "/") {
      return json({
        status: "ok",
        service: "Karta-AD Delivery API",
        version: "2.0.0",
        endpoints: [
          "POST /api/v1/orders",
          "GET  /api/v1/orders/:id",
          "GET  /api/v1/status/:id",
          "POST /api/v1/cancel",
          "POST /api/v1/calculate-price",
        ],
      });
    }

    // ---------- Auth ----------
    const apiKeyHeader = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const apiKey = apiKeyHeader || "";
    const key = await authenticate(apiKey);
    if (!key) {
      const ms = Date.now() - start;
      await logRequest(null, req.method, path, 401, ms, ip, ua, null);
      return json({ error: "INVALID_API_KEY", message: "Invalid or inactive API key" }, 401);
    }

    // ---------- Rate limit ----------
    const rl = rateLimit(apiKey);
    if (!rl.ok) {
      const ms = Date.now() - start;
      await logRequest(key.id, req.method, path, 429, ms, ip, ua, null);
      return json({ error: "RATE_LIMITED", message: `Too many requests. Retry in ${rl.retryAfter}s` }, 429, {
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.retryAfter),
      });
    }

    // ---------- Sandbox ----------
    const isSandbox = key.is_sandbox === true;

    // ---------- POST /api/v1/calculate-price ----------
    if (req.method === "POST" && (path === "/api/v1/calculate-price" || path === "/calculate-price")) {
      const body = await req.json();
      const { data, error } = await supabase.rpc("calculate_delivery_price", {
        p_pickup_lat: body.pickup_lat,
        p_pickup_lng: body.pickup_lng,
        p_dropoff_lat: body.dropoff_lat,
        p_dropoff_lng: body.dropoff_lng,
        p_weight_kg: body.weight_kg ?? 0,
      });
      const ms = Date.now() - start;
      await logRequest(key.id, req.method, path, error ? 400 : 200, ms, ip, ua, body);
      if (error || data?.error) return json({ error: error?.message || data.error }, 400);
      return json({ success: true, ...data }, 200, {
        "X-Sandbox": isSandbox ? "true" : "false",
      });
    }

    // ---------- POST /api/v1/orders ----------
    if (req.method === "POST" && (path === "/api/v1/orders" || path === "/api/v1/order" || path === "/order" || path === "/orders")) {
      const body = await req.json();
      const { data, error } = await supabase.rpc("create_delivery_order_v2", {
        p_api_key: apiKey,
        p_external_id: body.external_id ?? null,
        p_pickup_lat: body.pickup?.lat ?? body.pickup_lat ?? null,
        p_pickup_lng: body.pickup?.lng ?? body.pickup_lng ?? null,
        p_pickup_address: body.pickup?.address ?? body.pickup_address ?? null,
        p_dropoff_lat: body.dropoff?.lat ?? body.dropoff_lat ?? null,
        p_dropoff_lng: body.dropoff?.lng ?? body.dropoff_lng ?? null,
        p_dropoff_address: body.dropoff?.address ?? body.dropoff_address ?? null,
        p_recipient_name: body.customer?.name ?? body.recipient_name ?? null,
        p_recipient_phone: body.customer?.phone ?? body.recipient_phone ?? null,
        p_items: body.items ?? [],
        p_notes: body.notes ?? null,
        p_payment_method: body.payment_method ?? "cash",
      });

      const ms = Date.now() - start;
      await logRequest(key.id, req.method, path, error ? 400 : 200, ms, ip, ua, body);

      if (error || data?.error) {
        return json({ error: error?.message || data.error, message: data?.message }, 400);
      }

      // Sandbox-заказ: помечаем, не рассылаем вебхуки и не будим курьеров
      if (isSandbox) {
        await supabase.from("delivery_orders").update({ is_sandbox: true }).eq("id", data.id);
        return json({ success: true, order: { ...data, is_sandbox: true } }, 201);
      }

      // Webhook: order.created
      await queueWebhookEvent(key.id, data.id, "order.created", data);

      // Уведомить онлайн-курьеров о новом заказе
      try {
        await supabase.rpc("delivery_notify_new_order", { p_order_id: data.id });
      } catch (err) { console.error("delivery_notify_new_order:", err); }

      // Realtime-событие для курьеров
      try {
        const channel = supabase.channel("delivery-orders");
        channel.subscribe();
        channel.send({
          type: "broadcast",
          event: "order.created",
          payload: data,
        });
      } catch { /* не критично */ }

      return json({ success: true, order: data }, 201);
    }

    // ---------- GET /api/v1/orders/:id | /api/v1/status/:id ----------
    const orderMatch = path.match(/^\/api\/v1\/(?:orders|status)\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && orderMatch) {
      const orderId = orderMatch[1];
      const { data, error } = await supabase.rpc("get_delivery_order", { p_order_id: orderId });
      const ms = Date.now() - start;
      await logRequest(key.id, req.method, path, error ? 400 : 200, ms, ip, ua, null);
      if (error || data?.error) return json({ error: error?.message || data.error }, 404);
      const order = data.order;
      if (order.api_key_id !== key.id && !isSandbox) {
        return json({ error: "FORBIDDEN", message: "Order does not belong to this API key" }, 403);
      }
      // get_delivery_order с by_id возвращает order+items+tracking — вернём компактно для status
      return json({ success: true, order }, 200);
    }

    // ---------- POST /api/v1/cancel ----------
    if (req.method === "POST" && (path === "/api/v1/cancel" || path === "/cancel")) {
      const body = await req.json();
      const { data, error } = await supabase.rpc("cancel_delivery_order", {
        p_api_key: apiKey,
        p_order_id: body.order_id ?? body.id,
        p_reason: body.reason ?? "Requested by shop",
      });
      const ms = Date.now() - start;
      await logRequest(key.id, req.method, path, error ? 400 : 200, ms, ip, ua, body);
      if (error || data?.error) return json({ error: error?.message || data.error, message: data?.message }, 400);

      await queueWebhookEvent(key.id, body.order_id ?? body.id, "order.cancelled", data);
      return json({ success: true, ...data }, 200);
    }

    // ---------- GET /api/v1/orders (list for shop) ----------
    if (req.method === "GET" && (path === "/api/v1/orders" || path === "/orders")) {
      const { data: orders, error } = await supabase
        .from("delivery_orders")
        .select("id, order_number, status, price, total, pickup_address, dropoff_address, recipient_name, item_description, created_at, updated_at, courier_id, eta_min, payment_status")
        .eq("api_key_id", key.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const ms = Date.now() - start;
      await logRequest(key.id, req.method, path, error ? 400 : 200, ms, ip, ua, null);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, orders: orders ?? [] }, 200);
    }

    // ---------- 404 ----------
    const ms = Date.now() - start;
    await logRequest(key.id, req.method, path, 404, ms, ip, ua, null);
    return json({ error: "NOT_FOUND", message: `Unknown endpoint: ${path}` }, 404);
  } catch (err) {
    const ms = Date.now() - start;
    await logRequest(null, req.method, path, 500, ms, ip, ua, null);
    return json({ error: "INTERNAL", message: String(err) }, 500);
  }
});
