// push-send — отправка Web Push уведомлений.
//
// Два маршрута:
//   GET  /vapid-public-key — отдаёт публичный VAPID-ключ. При первом вызове
//        генерирует пару ключей и сохраняет в push_config (RLS без политик,
//        читает/пишет только service_role). Приватный ключ не покидает БД.
//   POST / — шлёт push подписчикам. Аутентификация: заголовок
//        Authorization: Bearer <webhook_secret> (общий секрет trigger→function,
//        лежит в push_config). verify_jwt:false, потому что вызов идёт из
//        pg_net (без JWT) и аутентификация делается этим секретом.
//
// При 404/410 от push-сервиса (подписка протухла) — удаляем строку подписки.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// deno-lint-ignore no-explicit-any
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, authorization, x-push-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function readPushConfig() {
  const { data, error } = await admin
    .from("push_config")
    .select("send_url, webhook_secret, vapid_public_key, vapid_private_key, vapid_subject")
    .eq("id", true)
    .single();
  if (error || !data) throw new Error(`push_config read failed: ${error?.message ?? "no row"}`);
  return data;
}

async function saveVapidKeys(pub: string, priv: string): Promise<void> {
  const { error } = await admin
    .from("push_config")
    .update({ vapid_public_key: pub, vapid_private_key: priv, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(`push_config write failed: ${error.message}`);
}

async function handlePublicKey(): Promise<Response> {
  const cfg = await readPushConfig();
  if (cfg.vapid_public_key && cfg.vapid_private_key) {
    return json(200, { publicKey: cfg.vapid_public_key });
  }
  const keys = webpush.generateVAPIDKeys();
  await saveVapidKeys(keys.publicKey, keys.privateKey);
  return json(200, { publicKey: keys.publicKey });
}

type SubRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

async function handleSend(req: Request): Promise<Response> {
  const cfg = await readPushConfig();

  const auth = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${cfg.webhook_secret}`;
  if (auth !== expected) {
    return json(401, { error: "unauthorized" });
  }

  if (!cfg.vapid_public_key || !cfg.vapid_private_key) {
    return json(503, { error: "vapid keys not initialised" });
  }

  let payload: {
    user_ids?: string[];
    title?: string;
    body?: string;
    tag?: string;
    url?: string;
    data?: Record<string, unknown>;
  };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid json" });
  }

  const userIds = Array.isArray(payload.user_ids) ? payload.user_ids : [];
  if (userIds.length === 0) {
    return json(200, { sent: 0 });
  }

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (error) {
    return json(500, { error: `subscriptions read failed: ${error.message}` });
  }

  webpush.setVapidDetails(
    cfg.vapid_subject ?? "mailto:admin@karta.tj",
    cfg.vapid_public_key,
    cfg.vapid_private_key,
  );

  const notification = JSON.stringify({
    title: payload.title ?? "Karta-AD",
    body: payload.body ?? "",
    tag: payload.tag ?? undefined,
    icon: "/logo.png",
    badge: "/icon-192.png",
    url: payload.url ?? "/",
    data: payload.data ?? {},
  });

  const dead: string[] = [];
  let sent = 0;

  for (const row of (subs ?? []) as SubRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        notification,
        { TTL: 60 * 60 * 24, headers: { Urgency: "normal", "X-TTL": "86400" } },
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) dead.push(row.id);
    }
  }

  if (dead.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", dead);
  }

  return json(200, { sent, dead: dead.length });
}

// Supabase вызывает функцию по пути вида /functions/v1/push-send[/suffix].
// Реальный pathname зависит от gateway, поэтому не сверяем точный префикс, а
// смотрим на хвост: /vapid-public-key, /send, либо сам корень (push-send).
// Корень нужен триггеру pg_net (POST) — иначе он получал бы 404.
function isRoute(pathname: string, suffix: string): boolean {
  if (pathname.endsWith(suffix)) return true;
  // Корень: путь заканчивается на имя функции (с опциональным слэшем).
  return suffix === "" && /\/push-send\/?$/.test(pathname);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const pathname = new URL(req.url).pathname;

  try {
    if (req.method === "GET" && (isRoute(pathname, "/vapid-public-key") || isRoute(pathname, ""))) {
      return await handlePublicKey();
    }
    if (req.method === "POST" && (isRoute(pathname, "/send") || isRoute(pathname, ""))) {
      return await handleSend(req);
    }
    return json(404, { error: "not found", path: pathname });
  } catch (err) {
    // Не утекаем стеком наружу.
    return json(500, { error: "internal", detail: (err as Error).message });
  }
});
