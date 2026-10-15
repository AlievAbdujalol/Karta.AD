// Web Push: подписка/отписка браузера и получение публичного VAPID-ключа.
//
// Ключи VAPID генерирует и хранит сервер (Edge Function push-send → таблица
// push_config). Приватный ключ отсюда никогда не запрашивается и не хранится.
// Подписка сохраняется в push_subscriptions (RLS: пользователь — только свои).

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-send`;

/** Есть ли поддержка Web Push в этом браузере (нужен SW + PushManager). */
export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * base64url → Uint8Array (applicationServerKey подписки).
 * @param {string} base64String
 * @returns {Uint8Array}
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Публичный VAPID-ключ с сервера (сервер генерирует пару при первом вызове).
 * @returns {Promise<string>}
 */
export async function getVapidPublicKey() {
  const res = await fetch(`${FUNCTIONS_URL}/vapid-public-key`);
  if (!res.ok) throw new Error(`[push] vapid key fetch failed: ${res.status}`);
  const { publicKey } = await res.json();
  if (!publicKey) throw new Error('[push] empty vapid public key');
  return publicKey;
}

/**
 * Подписать браузер на push и сохранить подписку в БД.
 * Возвращает PushSubscription или null, если подписка невозможна
 * (нет поддержки, нет разрешения, нет зарегистрированного SW — напр. в dev).
 * @param {{ id: string } | null | undefined} user
 * @returns {Promise<PushSubscription | null>}
 */
export async function subscribeToPush(user) {
  if (!isPushSupported() || !user?.id) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  // getRegistration (не .ready): в dev SW не зарегистрирован и .ready завис бы.
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.pushManager) return null;

  const applicationServerKey = urlBase64ToUint8Array(await getVapidPublicKey());
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });

  const json = sub.toJSON();
  const { supabase } = await import('@/api/supabase');
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
  if (error) throw new Error(`[push] subscription save failed: ${error.message}`);

  return sub;
}

/**
 * Отписать браузер и удалить подписку из БД.
 * @param {{ id: string } | null | undefined} user
 */
export async function unsubscribeFromPush(user) {
  if (!isPushSupported() || !user?.id) return;

  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;

  await sub.unsubscribe();
  const { supabase } = await import('@/api/supabase');
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
}
