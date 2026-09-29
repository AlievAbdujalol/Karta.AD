import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_REQUESTS_PER_MIN = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, x-api-key, x-signature, content-type, idempotency-key",
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

function makeRequestId() {
  return "req_" + Math.random().toString(36).slice(2, 10);
}

function errorJson(code: string, message: string, status: number, requestId: string) {
  return json({ success: false, error: { code, message, request_id: requestId } }, status);
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

function mapDelivery(o: Record<string, unknown>) {
  return {
    id: o.id,
    external_order_id: o.external_id ?? null,
    status: o.status,
    public_id: o.public_id ?? null,
    price: o.price,
    total: o.total ?? 0,
    distance_km: o.distance_km ?? null,
    eta_min: o.eta_min ?? null,
    order_number: o.order_number ?? null,
    tracking: { enabled: true },
    created_at: o.created_at,
  };
}

async function bodyIdempotencyKey(req: Request): Promise<string | null> {
  try {
    const clone = req.clone();
    const body = await clone.json();
    return typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : null;
  } catch {
    return null;
  }
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
          "POST /v1/deliveries",
          "POST /api/v1/orders",
          "GET  /api/v1/orders/:id",
          "GET  /api/v1/status/:id",
          "POST /api/v1/cancel",
          "POST /api/v1/calculate-price",
        ],
      });
    }

    // ---------- Auth ----------
    const isV1 = path.startsWith("/v1/");
    let apiKey =
      req.headers.get("x-api-key")?.trim() ||
      (req.headers.get("authorization")?.startsWith("Bearer ")
        ? req.headers.get("authorization")!.slice(7).trim()
        : "");
    if (!apiKey) {
      const rid = makeRequestId();
      if (isV1) return errorJson("UNAUTHORIZED", "Missing API key (Authorization: Bearer or x-api-key)", 401, rid);
      return json({ error: "MISSING_API_KEY" }, 401);
    }
    const key = await authenticate(apiKey);
    if (!key) {
      const rid = makeRequestId();
      if (isV1) return errorJson("UNAUTHORIZED", "Invalid or inactive API key", 401, rid);
      return json({ error: "INVALID_API_KEY" }, 401);
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

    // ---------- POST /v1/deliveries ----------
    if (req.method === "POST" && path === "/v1/deliveries") {
      const rid = makeRequestId();
      const idemHeader = req.headers.get("idempotency-key")?.trim() || "";
      const idemKey = idemHeader || (await bodyIdempotencyKey(req));

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorJson("INVALID_JSON", "Request body is not valid JSON", 400, rid);
      }
      if (!body || typeof body !== "object") {
        return errorJson("INVALID_BODY", "Request body must be a JSON object", 400, rid);
      }

      const pickupLat = Number(body.pickup_lat ?? body.pickup?.lat);
      const pickupLng = Number(body.pickup_lng ?? body.pickup?.lng);
      const dropoffLat = Number(body.dropoff_lat ?? body.dropoff?.lat);
      const dropoffLng = Number(body.dropoff_lng ?? body.dropoff?.lng);
      if (![pickupLat, pickupLng, dropoffLat, dropoffLng].every(Number.isFinite)) {
        return errorJson("MISSING_COORDINATES", "pickup and dropoff lat/lng are required", 400, rid);
      }

      // Idempotent replay (app-level; legacy NULL merchant_id rows never conflict in unique indexes)
      if (idemKey) {
        const { data: existing } = await supabase
          .from("delivery_orders")
          .select("*")
          .eq("api_key_id", key.id)
          .eq("idempotency_key", idemKey)
          .maybeSingle();
        if (existing) {
          await logRequest(key.id, req.method, path, 200, Date.now() - start, ip, ua, null);
          return json(
            { success: true, delivery: mapDelivery(existing), idempotent_replay: true },
            200,
            { "X-Request-Id": rid, "X-Idempotent-Replay": "true", "X-Sandbox": isSandbox ? "true" : "false" },
          );
        }
      }

      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      let totalWeight = 0;
      let totalPrice = 0;
      const items: Array<{ name: string; qty: number; price: number; weight_kg: number }> = [];
      for (const it of itemsRaw) {
        const name = String(it?.name ?? "").trim() || "item";
        const qty = Math.max(1, Number(it?.qty ?? it?.quantity ?? 1) || 1);
        const price = Number(it?.price ?? 0) || 0;
        const weightKg = Number(it?.weight_kg ?? 0) || 0;
        items.push({ name, qty, price, weight_kg: weightKg });
        totalWeight += qty * weightKg;
        totalPrice += qty * price;
      }
      const bodyWeight = Number(body.weight_kg ?? body.item_weight_kg ?? 0) || 0;
      const weightKg = bodyWeight > 0 ? bodyWeight : totalWeight;

      const { data: priceData, error: priceErr } = await supabase.rpc("calculate_delivery_price", {
        p_pickup_lat: pickupLat,
        p_pickup_lng: pickupLng,
        p_dropoff_lat: dropoffLat,
        p_dropoff_lng: dropoffLng,
        p_weight_kg: weightKg,
      });
      if (priceErr || priceData?.error) {
        console.error("calculate_delivery_price:", priceErr?.message || priceData?.error);
        return errorJson("PRICE_CALC_FAILED", priceErr?.message || String(priceData?.error), 502, rid);
      }

      const { data: created, error: insErr } = await supabase
        .from("delivery_orders")
        .insert({
          api_key_id: key.id,
          external_id: typeof body.external_order_id === "string" && body.external_order_id
            ? body.external_order_id
            : (typeof body.external_id === "string" && body.external_id ? body.external_id : null),
          idempotency_key: idemKey || null,
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          pickup_address: body.pickup?.address ?? body.pickup_address ?? null,
          dropoff_lat: dropoffLat,
          dropoff_lng: dropoffLng,
          dropoff_address: body.dropoff?.address ?? body.dropoff_address ?? null,
          recipient_name: body.customer?.name ?? body.recipient_name ?? null,
          recipient_phone: body.customer?.phone ?? body.recipient_phone ?? null,
          item_description: body.item_description ?? body.notes ?? null,
          notes: body.notes ?? null,
          price: priceData.price,
          total: totalPrice || priceData.price,
          distance_km: priceData.distance_km,
          eta_min: priceData.eta_min,
          item_weight_kg: weightKg,
          status: "searching_courier",
          payment_status: "unpaid",
        })
        .select()
        .single();

      if (insErr) {
        if (insErr.code === "23505") {
          return errorJson("IDEMPOTENCY_CONFLICT", "Idempotency key already used", 409, rid);
        }
        console.error("insert delivery_orders:", insErr.message);
        return errorJson("CREATE_FAILED", insErr.message, 500, rid);
      }

      if (items.length > 0) {
        const { error: itemsErr } = await supabase.from("delivery_order_items").insert(
          items.map((it) => ({
            order_id: created.id,
            name: it.name,
            qty: it.qty,
            price: it.price,
            weight_kg: it.weight_kg,
          })),
        );
        if (itemsErr) console.error("insert delivery_order_items:", itemsErr.message);
      }

      try {
        await supabase.from("delivery_tracking").insert({
          order_id: created.id,
          status: "searching_courier",
          note: "Заказ создан",
        });
      } catch (e) { console.error("delivery_tracking:", e); }

      if (!isSandbox) {
        await queueWebhookEvent(key.id, created.id, "delivery.created", mapDelivery(created));
        try {
          await supabase.rpc("delivery_notify_new_order", { p_order_id: created.id });
        } catch (e) { console.error("delivery_notify_new_order:", e); }
      }

      await logRequest(key.id, req.method, path, 201, Date.now() - start, ip, ua, body);
      return json({ success: true, delivery: mapDelivery(created) }, 201, {
        "X-Request-Id": rid,
        "X-Sandbox": isSandbox ? "true" : "false",
      });
    }

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

      // Webhook: delivery.created (create_delivery_order_v2 не эмитит сам)
      await queueWebhookEvent(key.id, data.id, "delivery.created", data);

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
          event: "delivery.created",
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
      // delivery.cancelled уже эмитится внутри cancel_delivery_order (RPC)
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
